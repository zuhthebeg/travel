// GET /api/my/level — 내 XP, 레벨, 칭호, 뱃지, 방문 통계
import type { Env } from '../../types';
import { jsonResponse, errorResponse } from '../../types';
import { getRequestUser } from '../../lib/auth';
import { getLevelInfo, getNextLevelXP } from '../../lib/xp';
import { getUserBadges } from '../../lib/badges';

export async function onRequestGet(context: { env: Env; request: Request }): Promise<Response> {
  const user = await getRequestUser(context.request, context.env.DB);
  if (!user) return errorResponse('Authentication required', 401);

  const row = await context.env.DB.prepare(
    'SELECT xp, level FROM users WHERE id = ?'
  ).bind(user.id).first<{ xp: number; level: number }>();

  const xp = row?.xp ?? 0;
  const level = row?.level ?? 1;
  const info = getLevelInfo(level);
  const nextXP = getNextLevelXP(xp);

  // 방문 통계
  const countryCount = await context.env.DB.prepare(
    'SELECT COUNT(DISTINCT country_code) as cnt FROM visited_places WHERE user_id = ?'
  ).bind(user.id).first<{ cnt: number }>();

  const cityCount = await context.env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM visited_places WHERE user_id = ? AND city_key != '__unknown__'"
  ).bind(user.id).first<{ cnt: number }>();

  // 뱃지
  const badges = await getUserBadges(context.env.DB, user.id);

  return jsonResponse({
    xp,
    level,
    title: info.title,
    titleKey: info.titleKey,
    emoji: info.emoji,
    nextLevelXP: nextXP,
    progress: nextXP ? Math.round((xp / nextXP) * 100) : 100,
    countries: countryCount?.cnt ?? 0,
    cities: cityCount?.cnt ?? 0,
    badges,
    earnedBadges: badges.filter(b => b.earned).length,
    totalBadges: badges.length,
  });
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
