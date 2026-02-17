/**
 * Temp ID Allocator — V3
 *
 * Negative integer IDs for locally-created entities.
 * Persisted in IndexedDB syncMeta to survive page reload.
 * Transactional to avoid multi-tab collision.
 */
import { getDB } from '../db';

/**
 * Generate next temp ID (negative, decrementing).
 * Uses IndexedDB transaction for atomicity.
 */
export async function genTempId(): Promise<number> {
  const db = await getDB();
  const tx = db.transaction('syncMeta', 'readwrite');
  const store = tx.objectStore('syncMeta');

  const row = await store.get('nextTempId');
  const current: number = row?.value ?? -1;
  const next = current - 1;

  await store.put({ key: 'nextTempId', value: next });
  await tx.done;

  return current;
}

/**
 * Check if an ID is a temp (local-only) ID.
 */
export function isTempId(id: number | string): boolean {
  if (typeof id === 'string') return false;
  return id < 0;
}

/**
 * Reset temp ID counter (for testing or after full reconcile).
 */
export async function resetTempId(): Promise<void> {
  const db = await getDB();
  await db.put('syncMeta', { key: 'nextTempId', value: -1 });
}
