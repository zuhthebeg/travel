// /api/schedules - 일정 목록 조회 및 생성

import type { Env, CreateScheduleRequest, Schedule } from '../types';
import { jsonResponse, errorResponse } from '../types';

// Removed parseMultiLangField helper function

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
      .all<Schedule>(); // Specify type for results

    // Parse multi-language fields for each schedule
    // No need to parse multi-language fields, they are now simple strings
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

    // 필수 필드 검증
    if (!body.plan_id || !body.date || !body.title) {
      return errorResponse('Missing required fields: plan_id, date, title');
    }

    // No need to stringify multi-language fields, they are now simple strings
    const titleToSave = body.title;
    const placeToSave = body.place;

    const result = await env.DB.prepare(
      `INSERT INTO schedules (plan_id, date, time, title, place, place_en, memo, plan_b, plan_c, order_index, latitude, longitude)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        body.plan_id,
        body.date,
        body.time || null,
        titleToSave,
        placeToSave || null,
        body.place_en || null,
        body.memo || null,
        body.plan_b || null,
        body.plan_c || null,
        body.order_index || 0,
        body.latitude || null,
        body.longitude || null
      )
      .run();

    // 생성된 schedule 조회
    const { results } = await env.DB.prepare('SELECT * FROM schedules WHERE id = ?')
      .bind(result.meta.last_row_id)
      .all<Schedule>();

    const createdSchedule = results[0];
    // No need to parse multi-language fields
    
    return jsonResponse({ schedule: createdSchedule }, 201);
  } catch (error) {
    console.error('Error creating schedule:', error);
    return errorResponse('Failed to create schedule', 500);
  }
}

export async function onRequestPut(context: { env: Env; request: Request }): Promise<Response> {
  const { env, request } = context;
  const url = new URL(request.url);
  const id = url.pathname.split('/').pop(); // Extract ID from URL

  if (!id) {
    return errorResponse('Schedule ID is required', 400);
  }

  try {
    const body: CreateScheduleRequest = await request.json(); // Use CreateScheduleRequest for simplicity, or define UpdateScheduleRequest

    const fieldsToUpdate: string[] = [];
    const valuesToUpdate: (string | number | null)[] = [];

    if (body.date !== undefined) {
      fieldsToUpdate.push('date = ?');
      valuesToUpdate.push(body.date);
    }
    if (body.time !== undefined) {
      fieldsToUpdate.push('time = ?');
      valuesToUpdate.push(body.time || null);
    }
    if (body.title !== undefined) {
      fieldsToUpdate.push('title = ?');
      const titleValue = body.title; // No need to stringify
      console.log('onRequestPut - titleValue:', titleValue, 'typeof titleValue:', typeof titleValue); // Debug log
      valuesToUpdate.push(titleValue);
    }
    if (body.place !== undefined) {
      fieldsToUpdate.push('place = ?');
      const placeValue = body.place; // No need to stringify
      console.log('onRequestPut - placeValue:', placeValue, 'typeof placeValue:', typeof placeValue); // Debug log
      valuesToUpdate.push(placeValue);
    }
    if (body.place_en !== undefined) {
      fieldsToUpdate.push('place_en = ?');
      valuesToUpdate.push(body.place_en || null);
    }
    if (body.memo !== undefined) {
      fieldsToUpdate.push('memo = ?');
      valuesToUpdate.push(body.memo || null);
    }
    if (body.plan_b !== undefined) {
      fieldsToUpdate.push('plan_b = ?');
      valuesToUpdate.push(body.plan_b || null);
    }
    if (body.plan_c !== undefined) {
      fieldsToUpdate.push('plan_c = ?');
      valuesToUpdate.push(body.plan_c || null);
    }
    if (body.order_index !== undefined) {
      fieldsToUpdate.push('order_index = ?');
      valuesToUpdate.push(body.order_index);
    }
    if ((body as any).latitude !== undefined) {
      fieldsToUpdate.push('latitude = ?');
      valuesToUpdate.push((body as any).latitude);
    }
    if ((body as any).longitude !== undefined) {
      fieldsToUpdate.push('longitude = ?');
      valuesToUpdate.push((body as any).longitude);
    }

    if (fieldsToUpdate.length === 0) {
      return errorResponse('No fields to update', 400);
    }

    valuesToUpdate.push(id); // Add ID for WHERE clause

    await env.DB.prepare(
      `UPDATE schedules SET ${fieldsToUpdate.join(', ')} WHERE id = ?`
    )
      .bind(...valuesToUpdate)
      .run();

    // Updated schedule 조회
    const { results } = await env.DB.prepare('SELECT * FROM schedules WHERE id = ?')
      .bind(id)
      .all<Schedule>();

    const updatedSchedule = results[0];
    // No need to parse multi-language fields
    
    return jsonResponse({ schedule: updatedSchedule });
  } catch (error) {
    console.error('Error updating schedule:', error);
    return errorResponse('Failed to update schedule', 500);
  }
}

export async function onRequestDelete(context: { env: Env; request: Request }): Promise<Response> {
  const { env, request } = context;
  const url = new URL(request.url);
  const id = url.pathname.split('/').pop(); // Extract ID from URL

  if (!id) {
    return errorResponse('Schedule ID is required', 400);
  }

  try {
    await env.DB.prepare('DELETE FROM schedules WHERE id = ?')
      .bind(id)
      .run();

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
