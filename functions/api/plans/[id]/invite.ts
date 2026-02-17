// POST /api/plans/:id/invite — 초대 코드 생성 (owner only)
// GET /api/plans/:id/invite — 초대 코드 조회

import type { Env } from '../../../../types';
import { jsonResponse, errorResponse } from '../../../../types';
import { getRequestUser } from '../../../../lib/auth';

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function onRequestPost(context: { env: Env; params: { id: string }; request: Request }) {
  const { env, params, request } = context;
  const planId = Number(params.id);

  const user = await getRequestUser(request, env.DB);
  if (!user) return errorResponse('Login required', 401);

  const plan = await env.DB.prepare('SELECT user_id, visibility, invite_code FROM plans WHERE id = ?')
    .bind(planId).first<{ user_id: number; visibility: string; invite_code: string | null }>();

  if (!plan || plan.user_id !== user.id) return errorResponse('Not found', 404);
  if (plan.visibility === 'private') return errorResponse('Private plans cannot be shared', 400);

  // 이미 코드 있으면 반환
  if (plan.invite_code) {
    return jsonResponse({ invite_code: plan.invite_code });
  }

  // 새 코드 생성
  const code = generateCode();
  await env.DB.prepare('UPDATE plans SET invite_code = ? WHERE id = ?').bind(code, planId).run();

  return jsonResponse({ invite_code: code });
}

export async function onRequestGet(context: { env: Env; params: { id: string }; request: Request }) {
  const { env, params, request } = context;
  const planId = Number(params.id);

  const user = await getRequestUser(request, env.DB);
  if (!user) return errorResponse('Login required', 401);

  const plan = await env.DB.prepare('SELECT user_id, invite_code FROM plans WHERE id = ?')
    .bind(planId).first<{ user_id: number; invite_code: string | null }>();

  if (!plan || plan.user_id !== user.id) return errorResponse('Not found', 404);

  return jsonResponse({ invite_code: plan.invite_code });
}
