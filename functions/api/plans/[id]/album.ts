// GET /api/plans/:id/album — 앨범 뷰 (인증 불필요, 누구나 접근 가능)
import type { Env } from '../../../types';
import { jsonResponse, errorResponse } from '../../../types';

export async function onRequestGet(context: {
  env: Env;
  params: { id: string };
  request: Request;
}): Promise<Response> {
  const { env, params } = context;
  const planId = params.id;

  try {
    const { results: plans } = await env.DB.prepare(
      'SELECT id, title, region, start_date, end_date, visibility FROM plans WHERE id = ?'
    ).bind(planId).all();

    if (!plans.length) {
      return errorResponse('Plan not found', 404);
    }

    const plan = plans[0] as any;

    const { results: schedules } = await env.DB.prepare(
      'SELECT id, title, place, date, time, order_index, latitude, longitude, country_code FROM schedules WHERE plan_id = ? ORDER BY date, order_index, time'
    ).bind(planId).all();

    // 각 스케줄의 moments 일괄 조회
    const scheduleIds = schedules.map((s: any) => s.id);
    let moments: any[] = [];
    if (scheduleIds.length > 0) {
      const placeholders = scheduleIds.map(() => '?').join(',');
      const { results } = await env.DB.prepare(
        `SELECT m.*, u.username, u.picture as user_picture
         FROM moments m
         LEFT JOIN users u ON m.user_id = u.id
         WHERE m.schedule_id IN (${placeholders})
         ORDER BY m.created_at DESC`
      ).bind(...scheduleIds).all();
      moments = results;
    }

    return jsonResponse({ plan, schedules, moments });
  } catch (error) {
    console.error('Error fetching album:', error);
    return errorResponse('Failed to fetch album', 500);
  }
}
