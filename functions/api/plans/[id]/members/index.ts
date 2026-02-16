// GET /api/plans/:id/members — 멤버 목록
// POST /api/plans/:id/members — 멤버 초대 (이메일 기반, MVP)

import type { Env } from '../../../../types';
import { jsonResponse, errorResponse } from '../../../../types';
import { getRequestUser, requirePlanOwner } from '../../../../lib/auth';

export async function onRequestGet(context: {
  env: Env;
  params: { id: string };
  request: Request;
}): Promise<Response> {
  const { env, params } = context;
  const planId = params.id;

  try {
    // plan owner 정보도 포함
    const plan = await env.DB.prepare(
      'SELECT user_id FROM plans WHERE id = ?'
    ).bind(planId).first<{ user_id: number }>();

    if (!plan) return errorResponse('Plan not found', 404);

    // owner 정보
    const owner = await env.DB.prepare(
      'SELECT id, username, email, picture FROM users WHERE id = ?'
    ).bind(plan.user_id).first();

    // 멤버 목록
    const { results: members } = await env.DB.prepare(
      `SELECT pm.role, pm.joined_at, u.id as user_id, u.username, u.email, u.picture
       FROM plan_members pm
       JOIN users u ON pm.user_id = u.id
       WHERE pm.plan_id = ?
       ORDER BY pm.joined_at`
    ).bind(planId).all();

    return jsonResponse({
      owner: { ...owner, role: 'owner' },
      members,
    });
  } catch (error) {
    console.error('Error fetching members:', error);
    return errorResponse('Failed to fetch members', 500);
  }
}

export async function onRequestPost(context: {
  env: Env;
  params: { id: string };
  request: Request;
}): Promise<Response> {
  const { env, params, request } = context;
  const planId = Number(params.id);

  try {
    const user = await getRequestUser(request, env.DB);
    if (!user) return errorResponse('Authentication required', 401);

    // owner만 초대 가능
    const isOwner = await requirePlanOwner(env.DB, planId, user.id);
    if (!isOwner) return errorResponse('Only plan owner can invite members', 403);

    const body = await request.json<{ email: string }>();
    if (!body.email) return errorResponse('Email is required');

    // 이메일로 유저 찾기
    const invitee = await env.DB.prepare(
      'SELECT id, username, email FROM users WHERE email = ?'
    ).bind(body.email).first<{ id: number; username: string; email: string }>();

    if (!invitee) {
      return errorResponse('해당 이메일로 가입된 유저가 없습니다', 404);
    }

    // 자기 자신 초대 방지
    if (invitee.id === user.id) {
      return errorResponse('자신을 초대할 수 없습니다');
    }

    // 이미 멤버인지 확인
    const existing = await env.DB.prepare(
      'SELECT 1 FROM plan_members WHERE plan_id = ? AND user_id = ?'
    ).bind(planId, invitee.id).first();

    if (existing) {
      return errorResponse('이미 초대된 멤버입니다');
    }

    await env.DB.prepare(
      'INSERT INTO plan_members (plan_id, user_id, role) VALUES (?, ?, ?)'
    ).bind(planId, invitee.id, 'member').run();

    return jsonResponse({
      member: { user_id: invitee.id, username: invitee.username, email: invitee.email, role: 'member' },
    }, 201);
  } catch (error) {
    console.error('Error inviting member:', error);
    return errorResponse('Failed to invite member', 500);
  }
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Credential',
    },
  });
}
