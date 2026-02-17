/**
 * Conflict detection helper for offline sync.
 * 
 * If client sends X-Base-Updated-At header, we compare it with the server's
 * current updated_at. If server is newer, return 409 with the server version.
 */

import { jsonResponse } from '../types';

export interface ConflictCheckResult {
  hasConflict: boolean;
  response?: Response;
}

/**
 * Check if an update would conflict with a newer server version.
 * Returns { hasConflict: true, response } if conflict detected.
 * Returns { hasConflict: false } if safe to proceed.
 */
export async function checkConflict(
  request: Request,
  db: D1Database,
  table: string,
  id: string | number,
): Promise<ConflictCheckResult> {
  const baseUpdatedAt = request.headers.get('X-Base-Updated-At');
  if (!baseUpdatedAt) {
    return { hasConflict: false };
  }

  const current = await db.prepare(
    `SELECT * FROM ${table} WHERE id = ?`
  ).bind(id).first();

  if (!current) {
    return { hasConflict: false };
  }

  const serverTime = current.updated_at as string | null;
  if (!serverTime) {
    return { hasConflict: false };
  }

  if (new Date(serverTime).getTime() > new Date(baseUpdatedAt).getTime()) {
    return {
      hasConflict: true,
      response: jsonResponse({ conflict: true, serverVersion: current }, 409),
    };
  }

  return { hasConflict: false };
}
