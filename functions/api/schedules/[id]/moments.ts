// GET /api/schedules/:id/moments — 순간 기록 목록
// POST /api/schedules/:id/moments — 순간 추가

import type { Env } from '../../../types';
import { jsonResponse, errorResponse } from '../../../types';
import { getRequestUser } from '../../../lib/auth';

export async function onRequestGet(context: {
  env: Env;
  params: { id: string };
  request: Request;
}): Promise<Response> {
  const { env, params } = context;
  const scheduleId = params.id;

  try {
    const { results } = await env.DB.prepare(
      `SELECT m.*, u.username, u.picture as user_picture
       FROM moments m
       LEFT JOIN users u ON m.user_id = u.id
       WHERE m.schedule_id = ?
       ORDER BY m.created_at DESC`
    ).bind(scheduleId).all();

    return jsonResponse({ moments: results, count: results.length });
  } catch (error) {
    console.error('Error fetching moments:', error);
    return errorResponse('Failed to fetch moments', 500);
  }
}

export async function onRequestPost(context: {
  env: Env;
  params: { id: string };
  request: Request;
}): Promise<Response> {
  const { env, params, request } = context;
  const scheduleId = params.id;

  try {
    const user = await getRequestUser(request, env.DB);
    if (!user) {
      return errorResponse('Authentication required', 401);
    }

    // schedule 존재 확인
    const schedule = await env.DB.prepare(
      'SELECT plan_id FROM schedules WHERE id = ?'
    ).bind(scheduleId).first<{ plan_id: number }>();

    if (!schedule) {
      return errorResponse('Schedule not found', 404);
    }

    const body = await request.json<{
      photo_data?: string;
      note?: string;
      mood?: string;
      revisit?: string;
    }>();

    // 최소 하나는 있어야
    if (!body.photo_data && !body.note && !body.mood && !body.revisit) {
      return errorResponse('At least one field required (photo_data, note, mood, or revisit)');
    }

    // note 길이 제한
    if (body.note && body.note.length > 200) {
      return errorResponse('Note must be 200 characters or less');
    }

    // mood/revisit 유효성
    if (body.mood && !['amazing', 'good', 'okay', 'meh', 'bad'].includes(body.mood)) {
      return errorResponse('Invalid mood value');
    }
    if (body.revisit && !['yes', 'no', 'maybe'].includes(body.revisit)) {
      return errorResponse('Invalid revisit value');
    }

    const result = await env.DB.prepare(
      `INSERT INTO moments (schedule_id, user_id, photo_data, note, mood, revisit)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      scheduleId,
      user.id,
      body.photo_data ?? null,
      body.note ?? null,
      body.mood ?? null,
      body.revisit ?? null
    ).run();

    const moment = await env.DB.prepare(
      'SELECT * FROM moments WHERE id = ?'
    ).bind(result.meta.last_row_id).first();

    return jsonResponse({ moment }, 201);
  } catch (error) {
    console.error('Error creating moment:', error);
    return errorResponse('Failed to create moment', 500);
  }
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Credential',
    },
  });
}
