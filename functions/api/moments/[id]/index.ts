// PUT /api/moments/:id — 순간 수정
// DELETE /api/moments/:id — 순간 삭제

import type { Env } from '../../../types';
import { jsonResponse, errorResponse } from '../../../types';
import { getRequestUser } from '../../../lib/auth';

export async function onRequestPut(context: {
  env: Env;
  params: { id: string };
  request: Request;
}): Promise<Response> {
  const { env, params, request } = context;
  const momentId = params.id;

  try {
    const user = await getRequestUser(request, env.DB);
    if (!user) {
      return errorResponse('Authentication required', 401);
    }

    // 작성자만 수정 가능
    const existing = await env.DB.prepare(
      'SELECT user_id FROM moments WHERE id = ?'
    ).bind(momentId).first<{ user_id: number }>();

    if (!existing) return errorResponse('Moment not found', 404);
    if (existing.user_id !== user.id) return errorResponse('Not authorized', 403);

    const body = await request.json<{
      photo_data?: string;
      note?: string;
      mood?: string;
      revisit?: string;
      rating?: number | null;
    }>();

    const updates: string[] = [];
    const values: any[] = [];

    if (body.note !== undefined) {
      if (body.note && body.note.length > 200) {
        return errorResponse('Note must be 200 characters or less');
      }
      updates.push('note = ?');
      values.push(body.note);
    }
    if (body.mood !== undefined) {
      updates.push('mood = ?');
      values.push(body.mood);
    }
    if (body.revisit !== undefined) {
      updates.push('revisit = ?');
      values.push(body.revisit);
    }
    if (body.photo_data !== undefined) {
      updates.push('photo_data = ?');
      values.push(body.photo_data);
    }
    if (body.rating !== undefined) {
      if (body.rating != null && (body.rating < 1 || body.rating > 5 || !Number.isInteger(body.rating))) {
        return errorResponse('Rating must be integer 1-5');
      }
      updates.push('rating = ?');
      values.push(body.rating);
    }

    if (updates.length === 0) {
      return errorResponse('No fields to update');
    }

    values.push(momentId);
    await env.DB.prepare(
      `UPDATE moments SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...values).run();

    const moment = await env.DB.prepare(
      'SELECT * FROM moments WHERE id = ?'
    ).bind(momentId).first();

    return jsonResponse({ moment });
  } catch (error) {
    console.error('Error updating moment:', error);
    return errorResponse('Failed to update moment', 500);
  }
}

export async function onRequestDelete(context: {
  env: Env;
  params: { id: string };
  request: Request;
}): Promise<Response> {
  const { env, params, request } = context;
  const momentId = params.id;

  try {
    const user = await getRequestUser(request, env.DB);
    if (!user) {
      return errorResponse('Authentication required', 401);
    }

    // 작성자 또는 plan owner가 삭제 가능
    const moment = await env.DB.prepare(
      `SELECT m.user_id, s.plan_id
       FROM moments m
       JOIN schedules s ON m.schedule_id = s.id
       WHERE m.id = ?`
    ).bind(momentId).first<{ user_id: number; plan_id: number }>();

    if (!moment) return errorResponse('Moment not found', 404);

    const isAuthor = moment.user_id === user.id;
    let isOwner = false;
    if (!isAuthor) {
      const plan = await env.DB.prepare(
        'SELECT user_id FROM plans WHERE id = ?'
      ).bind(moment.plan_id).first<{ user_id: number }>();
      isOwner = plan?.user_id === user.id;
    }

    if (!isAuthor && !isOwner) {
      return errorResponse('Not authorized', 403);
    }

    await env.DB.prepare('DELETE FROM moments WHERE id = ?').bind(momentId).run();
    return jsonResponse({ message: 'Moment deleted' });
  } catch (error) {
    console.error('Error deleting moment:', error);
    return errorResponse('Failed to delete moment', 500);
  }
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Credential',
    },
  });
}
