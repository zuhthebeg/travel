// /api/plans/:id - 특정 여행 계획 조회, 수정, 삭제

import type { Env, UpdatePlanRequest } from '../../../types';
import { jsonResponse, errorResponse } from '../../../types';
import { getRequestUser, checkPlanAccess } from '../../../lib/auth';
import { grantXP, XP_VALUES } from '../../../lib/xp';

export async function onRequestGet(context: {
  env: Env;
  params: { id: string };
  request: Request;
}): Promise<Response> {
  const { env, params, request } = context;
  const planId = params.id;

  try {
    // Plan과 스케줄을 함께 조회
    const { results: plans } = await env.DB.prepare('SELECT * FROM plans WHERE id = ?')
      .bind(planId)
      .all();

    if (plans.length === 0) {
      return errorResponse('Plan not found', 404);
    }

    const plan = plans[0] as any;

    // visibility 기반 접근 체크
    // public: 누구나 조회 가능 (비가입 포함)
    // shared: owner + 멤버만
    // private: owner만
    if (plan.visibility !== 'public') {
      const user = await getRequestUser(request, env.DB);
      const access = await checkPlanAccess(env.DB, Number(planId), user?.id ?? null);
      if (!access) {
        return errorResponse('Plan not found', 404);
      }
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

    // 기존 plan 조회 (날짜 변경 시 스케줄 이동을 위해)
    const { results: existingPlans } = await env.DB.prepare('SELECT start_date FROM plans WHERE id = ?')
      .bind(planId)
      .all();
    
    const oldStartDate = existingPlans[0]?.start_date as string | undefined;

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
    if ((body as any).visibility !== undefined) {
      const v = (body as any).visibility;
      if (['private', 'shared', 'public'].includes(v)) {
        updates.push('visibility = ?');
        values.push(v);
        // is_public 동기화
        updates.push('is_public = ?');
        values.push(v === 'public' ? 1 : 0);
      }
    }

    if (updates.length === 0) {
      return errorResponse('No fields to update');
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(planId);

    const query = `UPDATE plans SET ${updates.join(', ')} WHERE id = ?`;
    await env.DB.prepare(query).bind(...values).run();

    // 시작일이 변경된 경우 모든 스케줄 날짜도 함께 이동
    if (body.start_date && oldStartDate && body.start_date !== oldStartDate) {
      const oldDate = new Date(oldStartDate);
      const newDate = new Date(body.start_date);
      const diffDays = Math.round((newDate.getTime() - oldDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (diffDays !== 0) {
        const sign = diffDays > 0 ? '+' : '';
        await env.DB.prepare(
          `UPDATE schedules SET date = date(date, ? || ' days') WHERE plan_id = ?`
        ).bind(sign + diffDays, planId).run();
      }
    }

    // 업데이트된 plan 조회
    const { results } = await env.DB.prepare('SELECT * FROM plans WHERE id = ?')
      .bind(planId)
      .all();

    const plan = results[0] as any;

    // XP: 공개 전환 시
    try {
      const user = await getRequestUser(request, env.DB);
      if (user && plan.visibility === 'public') {
        await grantXP(env.DB, user.id, 'plan_public', XP_VALUES.plan_public, `plan_public:plan:${planId}`, 'plan', planId);
      }
    } catch (e) {
      console.error('XP grant error:', e);
    }

    return jsonResponse({ plan });
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
