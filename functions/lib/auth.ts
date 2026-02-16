// 인증 & 권한 체크 유틸리티
import type { Env, User } from '../types';

/**
 * Google credential에서 유저 식별. 없으면 null.
 * 현재: X-Auth-Credential 헤더 (Google JWT decode)
 * 향후: Bearer JWT로 전환 시 이 함수만 변경
 */
export async function getRequestUser(
  request: Request,
  db: D1Database
): Promise<User | null> {
  const credential = request.headers.get('X-Auth-Credential');
  if (!credential) return null;

  try {
    const payload = decodeGoogleJWT(credential);
    if (!payload?.sub) return null;

    const { results } = await db
      .prepare('SELECT * FROM users WHERE google_id = ?')
      .bind(payload.sub)
      .all<User>();

    return results?.[0] ?? null;
  } catch {
    return null;
  }
}

export type AccessLevel = 'owner' | 'member' | 'public' | null;

/**
 * 플랜 접근 권한 확인
 */
export async function checkPlanAccess(
  db: D1Database,
  planId: number,
  userId: number | null
): Promise<AccessLevel> {
  const plan = await db
    .prepare('SELECT user_id, visibility FROM plans WHERE id = ?')
    .bind(planId)
    .first<{ user_id: number; visibility: string }>();

  if (!plan) return null;

  if (userId && plan.user_id === userId) return 'owner';

  if (plan.visibility === 'public') return 'public';

  if (plan.visibility === 'shared' && userId) {
    const member = await db
      .prepare('SELECT 1 FROM plan_members WHERE plan_id = ? AND user_id = ?')
      .bind(planId, userId)
      .first();
    if (member) return 'member';
  }

  // private이고 owner 아닌 경우
  if (plan.visibility === 'private' && userId && plan.user_id !== userId) {
    return null;
  }

  return null;
}

/**
 * owner 전용 작업 체크
 */
export async function requirePlanOwner(
  db: D1Database,
  planId: number,
  userId: number | null
): Promise<boolean> {
  if (!userId) return false;
  const plan = await db
    .prepare('SELECT user_id FROM plans WHERE id = ?')
    .bind(planId)
    .first<{ user_id: number }>();
  return plan?.user_id === userId;
}

function decodeGoogleJWT(token: string): any {
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const decoded = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(decoded);
    }
    return JSON.parse(atob(token));
  } catch {
    return null;
  }
}
