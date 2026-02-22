// GET /api/users/:id/level — 다른 유저 레벨 (소셜 표시용)
import type { Env } from '../../../types';
import { jsonResponse, errorResponse } from '../../../types';
import { getLevelInfo } from '../../../lib/xp';

export async function onRequestGet(context: { env: Env; params: { id: string } }): Promise<Response> {
  const userId = parseInt(context.params.id);
  if (isNaN(userId)) return errorResponse('Invalid user ID', 400);

  const row = await context.env.DB.prepare(
    'SELECT id, username, picture, xp, level FROM users WHERE id = ?'
  ).bind(userId).first<{ id: number; username: string; picture: string | null; xp: number; level: number }>();

  if (!row) return errorResponse('User not found', 404);

  const info = getLevelInfo(row.level ?? 1);

  const countryCount = await context.env.DB.prepare(
    'SELECT COUNT(DISTINCT country_code) as cnt FROM visited_places WHERE user_id = ?'
  ).bind(userId).first<{ cnt: number }>();

  return jsonResponse({
    id: row.id,
    username: row.username,
    picture: row.picture,
    xp: row.xp ?? 0,
    level: row.level ?? 1,
    title: info.title,
    titleKey: info.titleKey,
    emoji: info.emoji,
    countries: countryCount?.cnt ?? 0,
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
