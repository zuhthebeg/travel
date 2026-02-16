// DELETE /api/plans/:id/members/:userId — 멤버 제거

import type { Env } from '../../../../types';
import { jsonResponse, errorResponse } from '../../../../types';
import { getRequestUser, requirePlanOwner } from '../../../../lib/auth';

export async function onRequestDelete(context: {
  env: Env;
  params: { id: string; userId: string };
  request: Request;
}): Promise<Response> {
  const { env, params, request } = context;
  const planId = Number(params.id);
  const targetUserId = Number(params.userId);

  try {
    const user = await getRequestUser(request, env.DB);
    if (!user) return errorResponse('Authentication required', 401);

    // owner 또는 본인만 제거 가능
    const isOwner = await requirePlanOwner(env.DB, planId, user.id);
    const isSelf = user.id === targetUserId;

    if (!isOwner && !isSelf) {
      return errorResponse('Not authorized', 403);
    }

    await env.DB.prepare(
      'DELETE FROM plan_members WHERE plan_id = ? AND user_id = ?'
    ).bind(planId, targetUserId).run();

    return jsonResponse({ message: 'Member removed' });
  } catch (error) {
    console.error('Error removing member:', error);
    return errorResponse('Failed to remove member', 500);
  }
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Credential',
    },
  });
}
