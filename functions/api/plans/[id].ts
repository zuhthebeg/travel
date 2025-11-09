// /api/plans/:id - 특정 여행 계획 조회, 수정, 삭제

import type { Env, UpdatePlanRequest } from '../../types';
import { jsonResponse, errorResponse } from '../../types';

export async function onRequestGet(context: {
  env: Env;
  params: { id: string };
}): Promise<Response> {
  const { env, params } = context;
  const planId = params.id;

  try {
    // Plan과 스케줄을 함께 조회
    const { results: plans } = await env.DB.prepare('SELECT * FROM plans WHERE id = ?')
      .bind(planId)
      .all();

    if (plans.length === 0) {
      return errorResponse('Plan not found', 404);
    }

    // 해당 plan의 스케줄들도 함께 조회
    const { results: schedules } = await env.DB.prepare(
      'SELECT * FROM schedules WHERE plan_id = ? ORDER BY date, order_index'
    )
      .bind(planId)
      .all();

    return jsonResponse({
      plan: plans[0],
      schedules: schedules,
    });
  } catch (error) {
    console.error('Error fetching plan:', error);
    return errorResponse('Failed to fetch plan', 500);
  }
}

export async function onRequestPut(context: {
  env: Env;
  params: { id: string };
  request: Request;
}): Promise<Response> {
  const { env, params, request } = context;
  const planId = params.id;

  try {
    const body: UpdatePlanRequest = await request.json();

    // 업데이트할 필드만 동적으로 쿼리 생성
    const updates: string[] = [];
    const values: any[] = [];

    if (body.title !== undefined) {
      updates.push('title = ?');
      values.push(body.title);
    }
    if (body.region !== undefined) {
      updates.push('region = ?');
      values.push(body.region);
    }
    if (body.start_date !== undefined) {
      updates.push('start_date = ?');
      values.push(body.start_date);
    }
    if (body.end_date !== undefined) {
      updates.push('end_date = ?');
      values.push(body.end_date);
    }
    if (body.thumbnail !== undefined) {
      updates.push('thumbnail = ?');
      values.push(body.thumbnail);
    }
    if (body.is_public !== undefined) {
      updates.push('is_public = ?');
      values.push(body.is_public ? 1 : 0);
    }

    if (updates.length === 0) {
      return errorResponse('No fields to update');
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(planId);

    const query = `UPDATE plans SET ${updates.join(', ')} WHERE id = ?`;
    await env.DB.prepare(query).bind(...values).run();

    // 업데이트된 plan 조회
    const { results } = await env.DB.prepare('SELECT * FROM plans WHERE id = ?')
      .bind(planId)
      .all();

    return jsonResponse({ plan: results[0] });
  } catch (error) {
    console.error('Error updating plan:', error);
    return errorResponse('Failed to update plan', 500);
  }
}

export async function onRequestDelete(context: {
  env: Env;
  params: { id: string };
}): Promise<Response> {
  const { env, params } = context;
  const planId = params.id;

  try {
    // CASCADE로 자동 삭제되지만, 명시적으로 삭제
    await env.DB.prepare('DELETE FROM schedules WHERE plan_id = ?').bind(planId).run();
    await env.DB.prepare('DELETE FROM recommendations WHERE plan_id = ?').bind(planId).run();
    await env.DB.prepare('DELETE FROM plans WHERE id = ?').bind(planId).run();

    return jsonResponse({ message: 'Plan deleted successfully' });
  } catch (error) {
    console.error('Error deleting plan:', error);
    return errorResponse('Failed to delete plan', 500);
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
