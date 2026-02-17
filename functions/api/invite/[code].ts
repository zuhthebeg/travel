// GET /api/invite/:code — 초대 정보 조회 (비로그인도 가능)
// POST /api/invite/:code — 초대 수락 (로그인 필요)

import type { Env } from '../../../types';
import { jsonResponse, errorResponse } from '../../../types';
import { getRequestUser } from '../../../lib/auth';
import { grantXP, XP_VALUES } from '../../../lib/xp';

export async function onRequestGet(context: { env: Env; params: { code: string }; request: Request }) {
  const { env, params } = context;

  const plan = await env.DB.prepare(
    'SELECT id, title, region, start_date, end_date, visibility FROM plans WHERE invite_code = ?'
  ).bind(params.code).first<any>();

  if (!plan) return errorResponse('Invalid invite link', 404);

  return jsonResponse({
    plan: {
      id: plan.id,
      title: plan.title,
      region: plan.region,
      start_date: plan.start_date,
      end_date: plan.end_date,
      visibility: plan.visibility,
    },
  });
}

export async function onRequestPost(context: { env: Env; params: { code: string }; request: Request }) {
  const { env, params, request } = context;

  const user = await getRequestUser(request, env.DB);
  if (!user) return errorResponse('Login required', 401);

  const plan = await env.DB.prepare(
    'SELECT id, user_id, visibility FROM plans WHERE invite_code = ?'
  ).bind(params.code).first<{ id: number; user_id: number; visibility: string }>();

  if (!plan) return errorResponse('Invalid invite link', 404);
  if (plan.visibility === 'private') return errorResponse('This plan is no longer shared', 400);

  // 이미 owner
  if (plan.user_id === user.id) {
    return jsonResponse({ message: 'You are the owner', already: true });
  }

  // 이미 멤버인지 확인
  const existing = await env.DB.prepare(
    'SELECT 1 FROM plan_members WHERE plan_id = ? AND user_id = ?'
  ).bind(plan.id, user.id).first();

  if (existing) {
    return jsonResponse({ message: 'Already a member', already: true, planId: plan.id });
  }

  // 멤버 추가
  await env.DB.prepare(
    'INSERT INTO plan_members (plan_id, user_id) VALUES (?, ?)'
  ).bind(plan.id, user.id).run();

  // XP 부여
  await grantXP(env.DB, user.id, XP_VALUES.INVITE_MEMBER, 'invite_accept', `plan:${plan.id}:user:${user.id}`);

  return jsonResponse({ message: 'Joined successfully', planId: plan.id });
}
