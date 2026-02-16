// GET /api/my/moments — 내가 참여한 모든 여행의 moments 타임라인
import type { Env } from '../../types';
import { jsonResponse, errorResponse } from '../../types';
import { getRequestUser } from '../../lib/auth';

export async function onRequestGet(context: {
  env: Env;
  request: Request;
}): Promise<Response> {
  const { env, request } = context;

  const user = await getRequestUser(request, env.DB);
  if (!user) {
    return errorResponse('Authentication required', 401);
  }

  try {
    // 내가 owner이거나 member인 모든 plan의 moments
    const { results } = await env.DB.prepare(`
      SELECT 
        m.*,
        u.username,
        u.picture as user_picture,
        s.title as schedule_title,
        s.place as schedule_place,
        s.date as schedule_date,
        s.time as schedule_time,
        p.id as plan_id,
        p.title as plan_title,
        p.region as plan_region
      FROM moments m
      JOIN schedules s ON m.schedule_id = s.id
      JOIN plans p ON s.plan_id = p.id
      LEFT JOIN users u ON m.user_id = u.id
      WHERE p.user_id = ?
         OR p.id IN (SELECT plan_id FROM plan_members WHERE user_id = ?)
      ORDER BY m.created_at DESC
      LIMIT 100
    `).bind(user.id, user.id).all();

    return jsonResponse({ moments: results, count: results.length });
  } catch (error) {
    console.error('Error fetching my moments:', error);
    return errorResponse('Failed to fetch moments', 500);
  }
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Credential',
    },
  });
}
