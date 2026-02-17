// /api/plans - 여행 계획 목록 조회 및 생성

import type { Env, Plan, CreatePlanRequest } from '../types';
import { jsonResponse, errorResponse } from '../types';
import { getRequestUser } from '../lib/auth';
import { grantXP, XP_VALUES } from '../lib/xp';

export async function onRequestGet(context: { env: Env; request: Request }): Promise<Response> {
  const { env, request } = context;
  const url = new URL(request.url);
  const userId = url.searchParams.get('user_id');
  const isPublic = url.searchParams.get('is_public');

  try {
    let query = 'SELECT * FROM plans';
    const conditions: string[] = [];
    const params: any[] = [];

    if (userId) {
      conditions.push('user_id = ?');
      params.push(userId);
    }

    // is_public 파라미터 → visibility 기반으로 처리 (하위 호환)
    if (isPublic === '1' || isPublic === 'true') {
      conditions.push("(is_public = 1 OR visibility = 'public')");
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC';

    const { results } = await env.DB.prepare(query).bind(...params).all();
    return jsonResponse({ plans: results });
  } catch (error) {
    console.error('Error fetching plans:', error);
    return errorResponse('Failed to fetch plans', 500);
  }
}

export async function onRequestPost(context: { env: Env; request: Request }): Promise<Response> {
  const { env, request } = context;

  try {
    const body: CreatePlanRequest = await request.json();

    // 필수 필드 검증
    if (!body.user_id || !body.title || !body.start_date || !body.end_date) {
      return errorResponse('Missing required fields: user_id, title, start_date, end_date');
    }

    // visibility 결정: 기본값 public (SEO 유입 목적)
    const visibility = body.visibility ?? 'public';

    const result = await env.DB.prepare(
      `INSERT INTO plans (user_id, title, region, start_date, end_date, thumbnail, is_public, visibility)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        body.user_id,
        body.title,
        body.region || null,
        body.start_date,
        body.end_date,
        body.thumbnail || null,
        body.is_public ? 1 : 0,
        visibility
      )
      .run();

    // 생성된 plan 조회
    const { results } = await env.DB.prepare('SELECT * FROM plans WHERE id = ?')
      .bind(result.meta.last_row_id)
      .all();

    const plan = results[0] as any;

    // XP 지급
    try {
      const user = await getRequestUser(request, env.DB);
      if (user) {
        await grantXP(env.DB, user.id, 'plan_create', XP_VALUES.plan_create, `plan_create:plan:${plan.id}`, 'plan', plan.id);
      }
    } catch (e) {
      console.error('XP grant error:', e);
    }

    return jsonResponse({ plan }, 201);
  } catch (error) {
    console.error('Error creating plan:', error);
    return errorResponse('Failed to create plan', 500);
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
