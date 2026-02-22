import { callOpenAI } from './_common';
import { getRequestUser, checkPlanAccess } from '../../lib/auth';

interface Env {
  OPENAI_API_KEY?: string;
  DB: D1Database;
}

type PhotoMeta = {
  tempId: string;
  fileName: string;
  datetime?: string | null;
  lat?: number | null;
  lng?: number | null;
};

type ScheduleLite = {
  id: number;
  date: string;
  time: string | null;
  title: string;
  place: string | null;
  latitude: number | null;
  longitude: number | null;
};

function fallbackAssign(photo: PhotoMeta, schedules: ScheduleLite[]): number {
  if (schedules.length === 0) return 0;
  if (photo.datetime) {
    const t = new Date(photo.datetime.replace(' ', 'T')).getTime();
    const sorted = [...schedules].sort((a, b) => {
      const ta = new Date(`${a.date}T${a.time || '12:00'}`).getTime();
      const tb = new Date(`${b.date}T${b.time || '12:00'}`).getTime();
      return Math.abs(ta - t) - Math.abs(tb - t);
    });
    return sorted[0].id;
  }
  return schedules[0].id;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { DB, OPENAI_API_KEY } = context.env;
  const body = await context.request.json<{ planId: number; photos: PhotoMeta[] }>();

  if (!body?.planId || !Array.isArray(body.photos) || body.photos.length === 0) {
    return new Response(JSON.stringify({ error: 'planId and photos are required' }), { status: 400 });
  }

  const user = await getRequestUser(context.request, DB);
  if (!user) return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401 });

  const access = await checkPlanAccess(DB, body.planId, user.id);
  if (!access) return new Response(JSON.stringify({ error: 'Access denied' }), { status: 403 });

  const rows = await DB.prepare(
    `SELECT id, date, time, title, place, latitude, longitude
     FROM schedules WHERE plan_id = ? ORDER BY date, time, order_index, id`
  ).bind(body.planId).all<ScheduleLite>();

  const schedules = rows.results || [];
  if (schedules.length === 0) {
    return new Response(JSON.stringify({ error: 'No schedules to classify against' }), { status: 400 });
  }

  let assignments: Array<{ tempId: string; scheduleIds: number[]; confidence: number; reason: string }> = [];

  if (OPENAI_API_KEY) {
    const prompt = `You classify travel photos to existing schedules.\nRules:\n- MUST assign every photo to at least 1 schedule id\n- scheduleIds can include multiple ids\n- Output strict JSON: {"assignments":[{"tempId":"...","scheduleIds":[1],"confidence":0.0,"reason":"..."}]}\n\nSchedules:\n${JSON.stringify(schedules)}\n\nPhotos metadata:\n${JSON.stringify(body.photos)}`;

    try {
      const raw = await callOpenAI(OPENAI_API_KEY, [
        { role: 'system', content: 'You are a precise JSON classifier.' },
        { role: 'user', content: prompt },
      ], {
        temperature: 0.1,
        maxTokens: 1200,
        responseFormat: 'json_object',
      });
      const parsed = JSON.parse(raw);
      assignments = Array.isArray(parsed.assignments) ? parsed.assignments : [];
    } catch (e) {
      console.error('classify-photos AI error', e);
    }
  }

  const normalized = body.photos.map((p) => {
    const found = assignments.find((a) => a.tempId === p.tempId);
    const validIds = (found?.scheduleIds || []).filter((id) => schedules.some((s) => s.id === id));
    const scheduleIds = validIds.length > 0 ? validIds : [fallbackAssign(p, schedules)];
    return {
      tempId: p.tempId,
      scheduleIds,
      confidence: typeof found?.confidence === 'number' ? found.confidence : 0.5,
      reason: found?.reason || 'fallback assignment',
    };
  });

  return new Response(JSON.stringify({ assignments: normalized }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Credential',
    },
  });
