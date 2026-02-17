/**
 * Sync Engine — V3
 *
 * Flushes pending opLog entries to the server.
 * Phases: compaction -> creates (parent-first) -> updates -> deletes (child-first) -> reconcile.
 * No premium gating in V3.
 */
import {
  getDB,
  getPendingOps,
  updateOpStatus,
  setSyncMeta,
  getSyncMeta,
  cacheSchedules,
  cacheMoments,
} from '../db';
import { plansAPI, schedulesAPI, momentsAPI } from '../api';
import type { OpLogEntry } from './types';
import { defaultLocalMeta } from './types';

// ─── Lock ───

async function withSyncLock(fn: () => Promise<void>): Promise<void> {
  if ('locks' in navigator) {
    await navigator.locks.request('travly-sync', { ifAvailable: true }, async (lock) => {
      if (!lock) {
        console.log('[sync] Lock not available, skipping');
        return;
      }
      await fn();
    });
  } else {
    // Fallback: simple flag
    const locked = await getSyncMeta<boolean>('syncLockOwner');
    if (locked) return;
    await setSyncMeta('syncLockOwner', true);
    try {
      await fn();
    } finally {
      await setSyncMeta('syncLockOwner', false);
    }
  }
}

// ─── Op Compaction ───

async function compactOps(ops: OpLogEntry[]): Promise<OpLogEntry[]> {
  const db = await getDB();
  const byEntityId = new Map<string, OpLogEntry[]>();

  for (const op of ops) {
    const key = `${op.entity}:${op.entityId}`;
    const group = byEntityId.get(key) || [];
    group.push(op);
    byEntityId.set(key, group);
  }

  const result: OpLogEntry[] = [];
  const toDelete: string[] = [];

  for (const [, group] of byEntityId) {
    const sorted = group.sort((a, b) => a.createdAt - b.createdAt);
    const hasCreate = sorted.find(o => o.action === 'create');
    const hasDelete = sorted.find(o => o.action === 'delete');
    const updates = sorted.filter(o => o.action === 'update');

    // Rule 1: create + delete = drop both
    if (hasCreate && hasDelete) {
      toDelete.push(...sorted.map(o => o.opId));
      continue;
    }

    // Rule 3: create + updates = merge into single create
    if (hasCreate && updates.length > 0) {
      const merged = { ...hasCreate };
      for (const u of updates) {
        merged.payload = { ...merged.payload, ...u.payload };
        toDelete.push(u.opId);
      }
      result.push(merged);
      continue;
    }

    // Rule 2: multiple updates = merge into last
    if (updates.length > 1) {
      const merged = { ...updates[updates.length - 1] };
      merged.payload = {};
      for (const u of updates) {
        merged.payload = { ...merged.payload, ...u.payload };
        if (u !== updates[updates.length - 1]) toDelete.push(u.opId);
      }
      result.push(merged);
      // Keep non-update ops
      for (const o of sorted) {
        if (o.action !== 'update') result.push(o);
      }
      continue;
    }

    // Rule 4: delete overrides prior updates
    if (hasDelete && updates.length > 0) {
      toDelete.push(...updates.map(o => o.opId));
      result.push(hasDelete);
      continue;
    }

    // No compaction needed
    result.push(...sorted);
  }

  // Delete compacted ops
  if (toDelete.length > 0) {
    const tx = db.transaction('opLog', 'readwrite');
    for (const opId of toDelete) {
      await tx.store.delete(opId);
    }
    await tx.done;
  }

  return result;
}

// ─── Sync phases ───

const ENTITY_ORDER_CREATE = ['plans', 'schedules', 'moments', 'travel_memos', 'comments'] as const;
const ENTITY_ORDER_DELETE = [...ENTITY_ORDER_CREATE].reverse();

async function syncCreates(ops: OpLogEntry[]): Promise<void> {
  const creates = ops.filter(o => o.action === 'create');
  const db = await getDB();

  for (const entityType of ENTITY_ORDER_CREATE) {
    const entityOps = creates.filter(o => o.entity === entityType);

    for (const op of entityOps) {
      try {
        await updateOpStatus(op.opId, 'syncing');
        let serverId: number | undefined;

        switch (entityType) {
          case 'schedules': {
            const payload = { ...op.payload };
            // Resolve parent temp IDs
            if (payload.plan_id < 0) {
              const mapped = await db.getFromIndex('idMap', 'by_entity_temp', ['plans', payload.plan_id]);
              if (mapped) payload.plan_id = mapped.serverId;
            }
            const schedule = await schedulesAPI.create(payload as any);
            serverId = schedule.id;
            await cacheSchedules([{ ...schedule, __local: { ...defaultLocalMeta, localUpdatedAt: Date.now() } }]);
            break;
          }
          case 'moments': {
            const payload = { ...op.payload };
            let scheduleId = payload.schedule_id;
            if (scheduleId < 0) {
              const mapped = await db.getFromIndex('idMap', 'by_entity_temp', ['schedules', scheduleId]);
              if (mapped) scheduleId = mapped.serverId;
            }
            const { moment } = await momentsAPI.create(scheduleId, payload);
            serverId = moment.id;
            await cacheMoments([{ ...moment, __local: { ...defaultLocalMeta, localUpdatedAt: Date.now() } }]);
            break;
          }
          case 'travel_memos': {
            // Use fetch directly since memosAPI isn't exported with create
            const API_BASE = import.meta.env.DEV ? 'http://127.0.0.1:9999' : '';
            const cred = localStorage.getItem('X-Auth-Credential') || localStorage.getItem('google_credential') || '';
            let planId = op.planId;
            if (planId < 0) {
              const mapped = await db.getFromIndex('idMap', 'by_entity_temp', ['plans', planId]);
              if (mapped) planId = mapped.serverId;
            }
            const res = await fetch(`${API_BASE}/api/plans/${planId}/memos`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Auth-Credential': cred },
              body: JSON.stringify(op.payload),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            serverId = data.memo?.id;
            break;
          }
          default:
            break;
        }

        // Write idMap
        if (serverId && typeof op.entityId === 'number' && op.entityId < 0) {
          await db.put('idMap', {
            mapKey: `${entityType}:${op.entityId}`,
            entity: entityType,
            tempId: op.entityId,
            serverId,
            mappedAt: Date.now(),
          });

          // Remap entity in store
          const store = entityType as 'schedules' | 'moments' | 'travel_memos';
          if (['schedules', 'moments', 'travel_memos'].includes(store)) {
            const old = await db.get(store, op.entityId);
            if (old) {
              await db.delete(store, op.entityId);
              (old as any).id = serverId;
              old.__local = { ...defaultLocalMeta, localUpdatedAt: Date.now() };
              await db.put(store, old);
            }
          }
        }

        await updateOpStatus(op.opId, 'done');
      } catch (err: any) {
        console.error(`[sync] Create failed for ${entityType}:${op.entityId}:`, err);
        await updateOpStatus(op.opId, op.retryCount >= 4 ? 'dead' : 'failed', err.message);
      }
    }
  }
}

async function handleConflict(op: OpLogEntry, serverVersion: Record<string, any>): Promise<void> {
  const db = await getDB();
  // Mark the op as conflict
  await updateOpStatus(op.opId, 'conflict');
  // Store server version in the cached entity
  const store = op.entity as 'plans' | 'schedules' | 'moments' | 'travel_memos';
  if (['plans', 'schedules', 'moments', 'travel_memos'].includes(store)) {
    const entityId = op.entityId as number;
    const existing = await db.get(store, entityId);
    if (existing) {
      existing.__local = {
        ...existing.__local,
        conflict: true,
        serverVersion,
      };
      await db.put(store, existing);
    }
  }
}

async function syncUpdates(ops: OpLogEntry[]): Promise<void> {
  const updates = ops.filter(o => o.action === 'update').sort((a, b) => a.createdAt - b.createdAt);
  const db = await getDB();

  for (const op of updates) {
    try {
      await updateOpStatus(op.opId, 'syncing');
      let entityId = op.entityId as number;

      // Resolve temp ID
      if (entityId < 0) {
        const mapped = await db.getFromIndex('idMap', 'by_entity_temp', [op.entity, entityId]);
        if (mapped) entityId = mapped.serverId;
        else { await updateOpStatus(op.opId, 'failed', 'Temp ID not mapped'); continue; }
      }

      const syncOptions = op.baseUpdatedAt ? { baseUpdatedAt: op.baseUpdatedAt } : undefined;

      switch (op.entity) {
        case 'plans':
          await plansAPI.update(entityId, op.payload, syncOptions);
          break;
        case 'schedules':
          await schedulesAPI.update(entityId, op.payload, syncOptions);
          break;
        case 'moments':
          await momentsAPI.update(entityId, op.payload, syncOptions);
          break;
        case 'travel_memos': {
          const API_BASE = import.meta.env.DEV ? 'http://127.0.0.1:9999' : '';
          const cred = localStorage.getItem('X-Auth-Credential') || localStorage.getItem('google_credential') || '';
          let planId = op.planId;
          if (planId < 0) {
            const mapped = await db.getFromIndex('idMap', 'by_entity_temp', ['plans', planId]);
            if (mapped) planId = mapped.serverId;
          }
          const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Auth-Credential': cred };
          if (op.baseUpdatedAt) headers['X-Base-Updated-At'] = op.baseUpdatedAt;
          const res = await fetch(`${API_BASE}/api/plans/${planId}/memos/${entityId}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(op.payload),
          });
          if (res.status === 409) {
            const data = await res.json();
            if (data.conflict) {
              await handleConflict(op, data.serverVersion);
              continue;
            }
          }
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          break;
        }
      }

      await updateOpStatus(op.opId, 'done');
    } catch (err: any) {
      // Check for conflict error from apiRequest
      if (err.status === 409 && err.serverVersion) {
        await handleConflict(op, err.serverVersion);
        continue;
      }
      console.error(`[sync] Update failed:`, err);
      await updateOpStatus(op.opId, op.retryCount >= 4 ? 'dead' : 'failed', err.message);
    }
  }
}

async function syncDeletes(ops: OpLogEntry[]): Promise<void> {
  const deletes = ops.filter(o => o.action === 'delete');
  const db = await getDB();

  for (const entityType of ENTITY_ORDER_DELETE) {
    const entityOps = deletes.filter(o => o.entity === entityType);

    for (const op of entityOps) {
      try {
        await updateOpStatus(op.opId, 'syncing');
        let entityId = op.entityId as number;

        if (entityId < 0) {
          // Already deleted before sync (create+delete compacted), skip
          await updateOpStatus(op.opId, 'done');
          continue;
        }

        switch (entityType) {
          case 'schedules':
            await schedulesAPI.delete(entityId);
            await db.delete('schedules', entityId);
            break;
          case 'moments':
            await momentsAPI.delete(entityId);
            await db.delete('moments', entityId);
            break;
          case 'travel_memos': {
            const API_BASE = import.meta.env.DEV ? 'http://127.0.0.1:9999' : '';
            const cred = localStorage.getItem('X-Auth-Credential') || localStorage.getItem('google_credential') || '';
            let planId = op.planId;
            if (planId < 0) {
              const mapped = await db.getFromIndex('idMap', 'by_entity_temp', ['plans', planId]);
              if (mapped) planId = mapped.serverId;
            }
            const res = await fetch(`${API_BASE}/api/plans/${planId}/memos/${entityId}`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json', 'X-Auth-Credential': cred },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            await db.delete('travel_memos', entityId);
            break;
          }
        }

        await updateOpStatus(op.opId, 'done');
      } catch (err: any) {
        console.error(`[sync] Delete failed:`, err);
        await updateOpStatus(op.opId, op.retryCount >= 4 ? 'dead' : 'failed', err.message);
      }
    }
  }
}

// ─── Main sync ───

export type SyncListener = (phase: string, progress?: { done: number; total: number }) => void;
const syncListeners = new Set<SyncListener>();

export function onSyncProgress(fn: SyncListener): () => void {
  syncListeners.add(fn);
  return () => syncListeners.delete(fn);
}

function emitSync(phase: string, progress?: { done: number; total: number }) {
  syncListeners.forEach(fn => fn(phase, progress));
}

export async function runSync(): Promise<{ synced: number; failed: number }> {
  let synced = 0, failed = 0;

  await withSyncLock(async () => {
    emitSync('compacting');

    // Get and compact pending ops
    const pending = await getPendingOps();
    if (pending.length === 0) {
      emitSync('idle');
      return;
    }

    const ops = await compactOps(pending);
    const total = ops.length;

    // Phase 1: Creates
    emitSync('creates', { done: 0, total });
    await syncCreates(ops);

    // Phase 2: Updates
    emitSync('updates', { done: 0, total });
    await syncUpdates(ops);

    // Phase 3: Deletes
    emitSync('deletes', { done: 0, total });
    await syncDeletes(ops);

    // Count results
    const db = await getDB();
    const all = await db.getAll('opLog');
    for (const op of all) {
      if (op.status === 'done') synced++;
      if (op.status === 'failed' || op.status === 'dead') failed++;
    }

    // Clean up done ops
    const tx = db.transaction('opLog', 'readwrite');
    for (const op of all) {
      if (op.status === 'done') await tx.store.delete(op.opId);
    }
    await tx.done;

    await setSyncMeta('lastSyncAt', Date.now());
    if (failed === 0) await setSyncMeta('lastSyncSuccessAt', Date.now());
    else await setSyncMeta('lastSyncErrorAt', Date.now());

    emitSync('idle');
  });

  return { synced, failed };
}

// ─── Auto-sync on online event ───

let autoSyncEnabled = false;

function handleOnline() {
  if (localStorage.getItem('offline_mode') !== 'true') return;
  runSync().catch(console.error);
}

export function enableAutoSync(): void {
  if (autoSyncEnabled) return;
  window.addEventListener('online', handleOnline);
  autoSyncEnabled = true;
}

export function disableAutoSync(): void {
  window.removeEventListener('online', handleOnline);
  autoSyncEnabled = false;
}
