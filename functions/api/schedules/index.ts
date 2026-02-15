// /api/schedules - 일정 목록 조회 및 생성

import type { Env, CreateScheduleRequest, Schedule } from '../../types';
import { jsonResponse, errorResponse } from '../../types';

export async function onRequestGet(context: { env: Env; request: Request }): Promise<Response> {
  const { env, request } = context;
  const url = new URL(request.url);
  const planId = url.searchParams.get('plan_id');

  try {
    if (!planId) {
      return errorResponse('plan_id parameter is required');
    }

    const { results } = await env.DB.prepare(
      'SELECT * FROM schedules WHERE plan_id = ? ORDER BY date, order_index'
    )
      .bind(planId)
      .all<Schedule>();

    return jsonResponse({ schedules: results });
  } catch (error) {
    console.error('Error fetching schedules:', error);
    return errorResponse('Failed to fetch schedules', 500);
  }
}

export async function onRequestPost(context: { env: Env; request: Request }): Promise<Response> {
  const { env, request } = context;

  try {
    const body: CreateScheduleRequest = await request.json();

    if (!body.plan_id || !body.date || !body.title) {
      return errorResponse('Missing required fields: plan_id, date, title');
    }

    const result = await env.DB.prepare(
      `INSERT INTO schedules (plan_id, date, time, title, place, place_en, memo, plan_b, plan_c, order_index, latitude, longitude)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        body.plan_id,
        body.date,
        body.time || null,
        body.title,
        body.place || null,
        body.place_en || null,
        body.memo || null,
        body.plan_b || null,
        body.plan_c || null,
        body.order_index || 0,
        body.latitude || null,
        body.longitude || null
      )
      .run();

    const { results } = await env.DB.prepare('SELECT * FROM schedules WHERE id = ?')
      .bind(result.meta.last_row_id)
      .all<Schedule>();

    return jsonResponse({ schedule: results[0] }, 201);
  } catch (error) {
    console.error('Error creating schedule:', error);
    return errorResponse('Failed to create schedule', 500);
  }
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
