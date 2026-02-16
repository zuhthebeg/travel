// POST /api/plans/:id/fork — 플랜을 내 앨범으로 복사

import type { Env } from '../../../types';
import { jsonResponse, errorResponse } from '../../../types';
import { getRequestUser, checkPlanAccess } from '../../../lib/auth';

export async function onRequestPost(context: {
  env: Env;
  params: { id: string };
  request: Request;
}): Promise<Response> {
  const { env, params, request } = context;
  const sourcePlanId = Number(params.id);

  try {
    const user = await getRequestUser(request, env.DB);
    if (!user) return errorResponse('Authentication required', 401);

    // 접근 권한 확인 (owner/member/public 모두 fork 가능)
    const access = await checkPlanAccess(env.DB, sourcePlanId, user.id);
    if (!access) return errorResponse('Plan not found or access denied', 404);

    // 원본 플랜 조회
    const source = await env.DB.prepare(
      'SELECT * FROM plans WHERE id = ?'
    ).bind(sourcePlanId).first<Record<string, any>>();

    if (!source) return errorResponse('Source plan not found', 404);

    // 플랜 복사
    const planResult = await env.DB.prepare(
      `INSERT INTO plans (user_id, title, region, country, country_code, start_date, end_date, thumbnail, is_public, visibility, forked_from)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'private', ?)`
    ).bind(
      user.id,
      source.title,
      source.region,
      source.country ?? null,
      source.country_code ?? null,
      source.start_date,
      source.end_date,
      source.thumbnail,
      sourcePlanId
    ).run();

    const newPlanId = planResult.meta.last_row_id;

    // self-reference 방지
    if (newPlanId === sourcePlanId) {
      await env.DB.prepare('DELETE FROM plans WHERE id = ?').bind(newPlanId).run();
      return errorResponse('Fork failed: self-reference', 500);
    }

    // 스케줄 복사 (moments는 복사 안 함 — 빈 앨범)
    const { results: schedules } = await env.DB.prepare(
      'SELECT * FROM schedules WHERE plan_id = ? ORDER BY date, order_index'
    ).bind(sourcePlanId).all<Record<string, any>>();

    if (schedules.length > 0) {
      const stmt = env.DB.prepare(
        `INSERT INTO schedules (plan_id, date, time, title, place, memo, plan_b, plan_c, order_index, latitude, longitude, place_en)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      const batch = schedules.map(s =>
        stmt.bind(
          newPlanId,
          s.date,
          s.time ?? null,
          s.title,
          s.place ?? null,
          s.memo ?? null,
          s.plan_b ?? null,
          s.plan_c ?? null,
          s.order_index ?? 0,
          s.latitude ?? null,
          s.longitude ?? null,
          s.place_en ?? null
        )
      );

      await env.DB.batch(batch);
    }

    // 새 플랜 조회
    const newPlan = await env.DB.prepare(
      'SELECT * FROM plans WHERE id = ?'
    ).bind(newPlanId).first();

    return jsonResponse({
      plan: newPlan,
      schedules_copied: schedules.length,
      forked_from: sourcePlanId,
    }, 201);
  } catch (error) {
    console.error('Error forking plan:', error);
    return errorResponse('Failed to fork plan', 500);
  }
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Credential',
    },
  });
}
