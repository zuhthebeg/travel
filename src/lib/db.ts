/**
 * IndexedDB — Travly Offline V3
 *
 * Multi-trip cache with opLog, idMap, mediaQueue, syncMeta.
 * Uses idb library for promise-based IndexedDB access.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  CachedPlan,
  CachedSchedule,
  CachedMoment,
  CachedMemo,
  CachedPlanMember,
  CachedUserProfile,
  OpLogEntry,
  IdMapping,
  MediaQueueEntry,
  SyncMetaEntry,
  PlanSnapshotMeta,
} from './offline/types';

// ─── Schema ───

const DB_NAME = 'travly-offline';
const DB_VERSION = 3;

interface TravlyDB extends DBSchema {
  plans: {
    key: number;
    value: CachedPlan;
    indexes: {
      by_user_id: number;
      by_updated_at: string;
    };
  };
  schedules: {
    key: number;
    value: CachedSchedule;
    indexes: {
      by_plan_id: number;
      by_plan_date: [number, string];
      by_plan_order: [number, string, number];
    };
  };
  moments: {
    key: number;
    value: CachedMoment;
    indexes: {
      by_schedule_id: number;
      by_user_id: number;
    };
  };
  travel_memos: {
    key: number;
    value: CachedMemo;
    indexes: {
      by_plan_id: number;
      by_plan_category: [number, string];
    };
  };
  plan_members: {
    key: string; // `${plan_id}:${user_id}`
    value: CachedPlanMember;
    indexes: {
      by_plan_id: number;
      by_user_id: number;
    };
  };
  user_profile: {
    key: number;
    value: CachedUserProfile;
  };
  planSnapshots: {
    key: string; // `plan:${planId}`
    value: PlanSnapshotMeta;
    indexes: {
      by_plan_id: number;
    };
  };
  opLog: {
    key: string; // opId
    value: OpLogEntry;
    indexes: {
      by_status_created: [string, number];
      by_entity: string;
      by_entity_id: [string, number | string];
      by_plan_id: number;
    };
  };
  idMap: {
    key: string; // `${entity}:${tempId}`
    value: IdMapping;
    indexes: {
      by_entity_temp: [string, number];
      by_entity_server: [string, number];
    };
  };
  mediaQueue: {
    key: string; // localRef
    value: MediaQueueEntry;
    indexes: {
      by_moment_id: number;
      by_status_created: [string, number];
      by_plan_id: number;
    };
  };
  syncMeta: {
    key: string;
    value: SyncMetaEntry;
  };
}

// ─── Singleton ───

let dbPromise: Promise<IDBPDatabase<TravlyDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<TravlyDB>> {
  if (!dbPromise) {
    dbPromise = openDB<TravlyDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // Fresh install or upgrade
        if (oldVersion < 3) {
          // Drop old stores if upgrading from V1/V2
          for (const name of db.objectStoreNames) {
            db.deleteObjectStore(name);
          }

          // ── Domain stores ──

          const plans = db.createObjectStore('plans', { keyPath: 'id' });
          plans.createIndex('by_user_id', 'user_id');
          plans.createIndex('by_updated_at', 'updated_at');

          const schedules = db.createObjectStore('schedules', { keyPath: 'id' });
          schedules.createIndex('by_plan_id', 'plan_id');
          schedules.createIndex('by_plan_date', ['plan_id', 'date']);
          schedules.createIndex('by_plan_order', ['plan_id', 'date', 'order_index']);

          const moments = db.createObjectStore('moments', { keyPath: 'id' });
          moments.createIndex('by_schedule_id', 'schedule_id');
          moments.createIndex('by_user_id', 'user_id');

          const memos = db.createObjectStore('travel_memos', { keyPath: 'id' });
          memos.createIndex('by_plan_id', 'plan_id');
          memos.createIndex('by_plan_category', ['plan_id', 'category']);

          const members = db.createObjectStore('plan_members', { keyPath: 'id' });
          members.createIndex('by_plan_id', 'plan_id');
          members.createIndex('by_user_id', 'user_id');

          db.createObjectStore('user_profile', { keyPath: 'id' });

          const snapshots = db.createObjectStore('planSnapshots', { keyPath: 'key' });
          snapshots.createIndex('by_plan_id', 'planId');

          // ── Sync stores ──

          const opLog = db.createObjectStore('opLog', { keyPath: 'opId' });
          opLog.createIndex('by_status_created', ['status', 'createdAt']);
          opLog.createIndex('by_entity', 'entity');
          opLog.createIndex('by_entity_id', ['entity', 'entityId']);
          opLog.createIndex('by_plan_id', 'planId');

          const idMap = db.createObjectStore('idMap', { keyPath: 'mapKey' });
          idMap.createIndex('by_entity_temp', ['entity', 'tempId']);
          idMap.createIndex('by_entity_server', ['entity', 'serverId']);

          const media = db.createObjectStore('mediaQueue', { keyPath: 'localRef' });
          media.createIndex('by_moment_id', 'momentId');
          media.createIndex('by_status_created', ['status', 'createdAt']);
          media.createIndex('by_plan_id', 'planId');

          db.createObjectStore('syncMeta', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

// ─── SyncMeta helpers ───

export async function getSyncMeta<T = any>(key: string): Promise<T | undefined> {
  const db = await getDB();
  const row = await db.get('syncMeta', key);
  return row?.value as T | undefined;
}

export async function setSyncMeta(key: string, value: any): Promise<void> {
  const db = await getDB();
  await db.put('syncMeta', { key, value });
}

// ─── Plan snapshot helpers ───

export async function getPlanSnapshot(planId: number): Promise<PlanSnapshotMeta | undefined> {
  const db = await getDB();
  return db.get('planSnapshots', `plan:${planId}`);
}

export async function setPlanSnapshot(meta: Omit<PlanSnapshotMeta, 'key'>): Promise<void> {
  const db = await getDB();
  await db.put('planSnapshots', {
    key: `plan:${meta.planId}`,
    ...meta,
  });
}

// ─── OpLog helpers ───

export async function addOp(entry: OpLogEntry): Promise<void> {
  const db = await getDB();
  await db.add('opLog', entry);
}

export async function getPendingOps(): Promise<OpLogEntry[]> {
  const db = await getDB();
  const range = IDBKeyRange.bound(['pending', 0], ['pending', Infinity]);
  return db.getAllFromIndex('opLog', 'by_status_created', range);
}

export async function getOpsByEntity(entity: string, entityId: number | string): Promise<OpLogEntry[]> {
  const db = await getDB();
  return db.getAllFromIndex('opLog', 'by_entity_id', [entity, entityId]);
}

export async function updateOpStatus(
  opId: string,
  status: OpLogEntry['status'],
  error?: string,
): Promise<void> {
  const db = await getDB();
  const op = await db.get('opLog', opId);
  if (!op) return;
  op.status = status;
  op.updatedAt = Date.now();
  if (error !== undefined) op.lastError = error;
  if (status === 'failed') op.retryCount += 1;
  await db.put('opLog', op);
}

// ─── Convenience: count pending/failed ───

export async function countOpsByStatus(): Promise<{ pending: number; failed: number; dead: number }> {
  const db = await getDB();
  const all = await db.getAll('opLog');
  let pending = 0, failed = 0, dead = 0;
  for (const op of all) {
    if (op.status === 'pending' || op.status === 'syncing') pending++;
    else if (op.status === 'failed') failed++;
    else if (op.status === 'dead') dead++;
  }
  return { pending, failed, dead };
}

// ─── Bulk cache helpers ───

export async function cachePlans(plans: CachedPlan[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('plans', 'readwrite');
  for (const plan of plans) {
    await tx.store.put(plan);
  }
  await tx.done;
}

export async function cacheSchedules(schedules: CachedSchedule[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('schedules', 'readwrite');
  for (const s of schedules) {
    await tx.store.put(s);
  }
  await tx.done;
}

export async function cacheMoments(moments: CachedMoment[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('moments', 'readwrite');
  for (const m of moments) {
    await tx.store.put(m);
  }
  await tx.done;
}

export async function cacheMemos(memos: CachedMemo[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('travel_memos', 'readwrite');
  for (const m of memos) {
    await tx.store.put(m);
  }
  await tx.done;
}

export async function cacheMembers(planId: number, members: CachedPlanMember[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('plan_members', 'readwrite');
  for (const m of members) {
    await tx.store.put({ ...m, id: `${planId}:${m.user_id}`, plan_id: planId });
  }
  await tx.done;
}

// ─── Read helpers ───

export async function getCachedPlans(): Promise<CachedPlan[]> {
  const db = await getDB();
  const all = await db.getAll('plans');
  return all.filter(p => !p.__local?.deleted);
}

export async function getCachedPlan(id: number): Promise<CachedPlan | undefined> {
  const db = await getDB();
  const plan = await db.get('plans', id);
  if (plan?.__local?.deleted) return undefined;
  return plan;
}

export async function getCachedSchedulesByPlan(planId: number): Promise<CachedSchedule[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('schedules', 'by_plan_id', planId);
  return all.filter(s => !s.__local?.deleted);
}

export async function getCachedMemosByPlan(planId: number): Promise<CachedMemo[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('travel_memos', 'by_plan_id', planId);
  return all.filter(m => !m.__local?.deleted);
}

export async function getCachedMomentsBySchedule(scheduleId: number): Promise<CachedMoment[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('moments', 'by_schedule_id', scheduleId);
  return all.filter(m => !m.__local?.deleted);
}

export async function getCachedMembersByPlan(planId: number): Promise<CachedPlanMember[]> {
  const db = await getDB();
  return db.getAllFromIndex('plan_members', 'by_plan_id', planId);
}

// ─── Delete helpers (for cache cleanup) ───

export async function clearPlanCache(planId: number): Promise<void> {
  const db = await getDB();

  // Clear schedules
  const schedules = await db.getAllFromIndex('schedules', 'by_plan_id', planId);
  const tx1 = db.transaction(['schedules', 'moments'], 'readwrite');
  for (const s of schedules) {
    // Clear moments per schedule
    const moments = await tx1.objectStore('moments').index('by_schedule_id').getAll(s.id);
    for (const m of moments) {
      await tx1.objectStore('moments').delete(m.id);
    }
    await tx1.objectStore('schedules').delete(s.id);
  }
  await tx1.done;

  // Clear memos
  const memos = await db.getAllFromIndex('travel_memos', 'by_plan_id', planId);
  const tx2 = db.transaction('travel_memos', 'readwrite');
  for (const m of memos) {
    await tx2.store.delete(m.id);
  }
  await tx2.done;

  // Clear members
  const members = await db.getAllFromIndex('plan_members', 'by_plan_id', planId);
  const tx3 = db.transaction('plan_members', 'readwrite');
  for (const m of members) {
    await tx3.store.delete(m.id);
  }
  await tx3.done;

  // Clear plan itself
  await db.delete('plans', planId);

  // Clear snapshot meta
  await db.delete('planSnapshots', `plan:${planId}`);
}

// ─── Full DB wipe (for logout / debug) ───

export async function clearAllOfflineData(): Promise<void> {
  const db = await getDB();
  await db.clear('plans');
  await db.clear('schedules');
  await db.clear('moments');
  await db.clear('travel_memos');
  await db.clear('plan_members');
  await db.clear('user_profile');
  await db.clear('planSnapshots');
  await db.clear('opLog');
  await db.clear('idMap');
  await db.clear('mediaQueue');
  await db.clear('syncMeta');
}

export type { TravlyDB };
