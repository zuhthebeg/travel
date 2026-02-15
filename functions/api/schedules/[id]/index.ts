// /api/schedules/:id - 특정 일정 조회, 수정, 삭제

import type { Env, UpdateScheduleRequest } from '../../../types';
import { jsonResponse, errorResponse } from '../../../types';

export async function onRequestGet(context: {
  env: Env;
  params: { id: string };
}): Promise<Response> {
  const { env, params } = context;
  const scheduleId = params.id;

  try {
    const { results } = await env.DB.prepare('SELECT * FROM schedules WHERE id = ?')
      .bind(scheduleId)
      .all();

    if (results.length === 0) {
      return errorResponse('Schedule not found', 404);
    }

    return jsonResponse({ schedule: results[0] });
  } catch (error) {
    console.error('Error fetching schedule:', error);
    return errorResponse('Failed to fetch schedule', 500);
  }
}

export async function onRequestPut(context: {
  env: Env;
  params: { id: string };
  request: Request;
}): Promise<Response> {
  const { env, params, request } = context;
  const scheduleId = params.id;

  try {
    const body: UpdateScheduleRequest = await request.json();

    // 업데이트할 필드만 동적으로 쿼리 생성
    const updates: string[] = [];
    const values: any[] = [];

    if (body.date !== undefined) {
      updates.push('date = ?');
      values.push(body.date);
    }
    if (body.time !== undefined) {
      updates.push('time = ?');
      values.push(body.time);
    }
    if (body.title !== undefined) {
      updates.push('title = ?');
      values.push(body.title);
    }
    if (body.place !== undefined) {
      updates.push('place = ?');
      values.push(body.place);
    }
    if (body.memo !== undefined) {
      updates.push('memo = ?');
      values.push(body.memo);
    }
    if (body.plan_b !== undefined) {
      updates.push('plan_b = ?');
      values.push(body.plan_b);
    }
    if (body.plan_c !== undefined) {
      updates.push('plan_c = ?');
      values.push(body.plan_c);
    }
    if (body.order_index !== undefined) {
      updates.push('order_index = ?');
      values.push(body.order_index);
    }
    if (body.rating !== undefined) {
      updates.push('rating = ?');
      values.push(body.rating);
    }
    if (body.review !== undefined) {
      updates.push('review = ?');
      values.push(body.review);
    }
    if ((body as any).latitude !== undefined) {
      updates.push('latitude = ?');
      values.push((body as any).latitude);
    }
    if ((body as any).longitude !== undefined) {
      updates.push('longitude = ?');
      values.push((body as any).longitude);
    }
    if ((body as any).place_en !== undefined) {
      updates.push('place_en = ?');
      values.push((body as any).place_en);
    }

    if (updates.length === 0) {
      return errorResponse('No fields to update');
    }

    values.push(scheduleId);

    const query = `UPDATE schedules SET ${updates.join(', ')} WHERE id = ?`;
    await env.DB.prepare(query).bind(...values).run();

    // 업데이트된 schedule 조회
    const { results } = await env.DB.prepare('SELECT * FROM schedules WHERE id = ?')
      .bind(scheduleId)
      .all();

    return jsonResponse({ schedule: results[0] });
  } catch (error) {
    console.error('Error updating schedule:', error);
    return errorResponse('Failed to update schedule', 500);
  }
}

export async function onRequestDelete(context: {
  env: Env;
  params: { id: string };
}): Promise<Response> {
  const { env, params } = context;
  const scheduleId = params.id;

  try {
    await env.DB.prepare('DELETE FROM schedules WHERE id = ?').bind(scheduleId).run();
    return jsonResponse({ message: 'Schedule deleted successfully' });
  } catch (error) {
    console.error('Error deleting schedule:', error);
    return errorResponse('Failed to delete schedule', 500);
  }
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
