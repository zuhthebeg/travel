/**
 * Offline-Aware API Wrapper — V3
 *
 * Wraps existing api.ts with offline routing:
 * - READ: server-first, local fallback (when offline_mode=ON)
 * - WRITE: server-first write-through; opLog fallback on failure
 * - Blocked: plan create, member/invite management
 *
 * Components should import from here instead of api.ts directly.
 */
import { plansAPI, schedulesAPI, momentsAPI, membersAPI } from './api';
import {
  getDB,
  getCachedPlans,
  getCachedPlan,
  getCachedSchedulesByPlan,
  getCachedMemosByPlan,
  getCachedMomentsBySchedule,
  getCachedMembersByPlan,
  cachePlans,
  cacheSchedules,
  cacheMemos,
  cacheMoments,
  addOp,
  countOpsByStatus,
} from './db';
import { genTempId, isTempId } from './offline/tempId';
import type {
  CachedPlan,
  CachedSchedule,
  CachedMoment,
  CachedMemo,
  OpLogEntry,
  LocalMeta,
} from './offline/types';
import { defaultLocalMeta } from './offline/types';
import type { Plan, Schedule, Moment, TravelMemo, PlanMembersResponse } from '../store/types';

// ─── Helpers ───

export function isOfflineMode(): boolean {
  return localStorage.getItem('offline_mode') === 'true';
}

function withLocal<T>(entity: T): T & { __local: LocalMeta } {
  return { ...entity, __local: { ...defaultLocalMeta, localUpdatedAt: Date.now() } };
}

function makeOp(
  partial: Omit<OpLogEntry, 'opId' | 'status' | 'retryCount' | 'createdAt' | 'updatedAt'>,
): OpLogEntry {
  return {
    ...partial,
    opId: crypto.randomUUID(),
    status: 'pending',
    retryCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Try server, fallback to local.
 * If server succeeds, cache result.
 */
async function serverFirstRead<T>(
  serverFn: () => Promise<T>,
  localFn: () => Promise<T | undefined>,
  cacheFn?: (data: T) => Promise<void>,
): Promise<T> {
  if (!isOfflineMode()) {
    return serverFn();
  }

  try {
    const data = await serverFn();
    if (cacheFn) {
      cacheFn(data).catch(() => {}); // fire-and-forget cache
    }
    return data;
  } catch {
    const local = await localFn();
    if (local !== undefined) return local;
    throw new Error('오프라인 데이터를 찾을 수 없습니다.');
  }
}

/**
 * Try server write, fallback to local + opLog.
 */
async function serverFirstWrite<T>(
  serverFn: () => Promise<T>,
  localFn: () => Promise<T>,
  cacheFn?: (data: T) => Promise<void>,
): Promise<T> {
  if (!isOfflineMode()) {
    return serverFn();
  }

  try {
    const data = await serverFn();
    if (cacheFn) {
      cacheFn(data).catch(() => {});
    }
    return data;
  } catch {
    // Offline fallback
    return localFn();
  }
}

// ─── Plans API (offline-aware) ───

export const offlinePlansAPI = {
  getAll: async (params?: { user_id?: number; is_public?: boolean; mine?: boolean }): Promise<Plan[]> => {
    return serverFirstRead(
      () => plansAPI.getAll(params),
      async () => {
        const cached = await getCachedPlans();
        return cached as Plan[];
      },
      async (plans) => {
        await cachePlans(plans.map(p => withLocal(p)) as CachedPlan[]);
      },
    );
  },

  getById: async (id: number): Promise<{ plan: Plan; schedules: Schedule[] }> => {
    return serverFirstRead(
      () => plansAPI.getById(id),
      async () => {
        const plan = await getCachedPlan(id);
        if (!plan) return undefined;
        const schedules = await getCachedSchedulesByPlan(id);
        return { plan: plan as Plan, schedules: schedules as Schedule[] };
      },
      async (data) => {
        await cachePlans([withLocal(data.plan)] as CachedPlan[]);
        await cacheSchedules(data.schedules.map(s => withLocal(s)) as CachedSchedule[]);
      },
    );
  },

  update: async (
    id: number,
    data: Parameters<typeof plansAPI.update>[1],
  ): Promise<Plan> => {
    return serverFirstWrite(
      async () => {
        const plan = await plansAPI.update(id, data);
        await cachePlans([withLocal(plan)] as CachedPlan[]);
        return plan;
      },
      async () => {
        const db = await getDB();
        const existing = await db.get('plans', id);
        if (!existing) throw new Error('Plan not found in cache');
        const updated = { ...existing, ...data, updated_at: new Date().toISOString() };
        updated.__local = { ...defaultLocalMeta, dirty: true, pendingSync: true, localUpdatedAt: Date.now() };
        await db.put('plans', updated);
        await addOp(makeOp({
          planId: id,
          entity: 'plans',
          entityId: id,
          action: 'update',
          payload: data,
          baseUpdatedAt: existing.updated_at,
        }));
        return updated as Plan;
      },
    );
  },

  // create: BLOCKED offline
  create: async (data: Parameters<typeof plansAPI.create>[0]): Promise<Plan> => {
    if (isOfflineMode() && !navigator.onLine) {
      throw new Error('여행 생성은 온라인에서만 가능합니다.');
    }
    return plansAPI.create(data);
  },

  // delete: BLOCKED offline
  delete: async (id: number) => {
    if (isOfflineMode() && !navigator.onLine) {
      throw new Error('여행 삭제는 온라인에서만 가능합니다.');
    }
    return plansAPI.delete(id);
  },
};

// ─── Schedules API (offline-aware) ───

export const offlineSchedulesAPI = {
  getByPlanId: async (planId: number): Promise<Schedule[]> => {
    return serverFirstRead(
      () => schedulesAPI.getByPlanId(planId),
      async () => {
        const cached = await getCachedSchedulesByPlan(planId);
        return cached as Schedule[];
      },
      async (schedules) => {
        await cacheSchedules(schedules.map(s => withLocal(s)) as CachedSchedule[]);
      },
    );
  },

  create: async (data: Parameters<typeof schedulesAPI.create>[0]): Promise<Schedule> => {
    return serverFirstWrite(
      async () => {
        const schedule = await schedulesAPI.create(data);
        await cacheSchedules([withLocal(schedule)] as CachedSchedule[]);
        return schedule;
      },
      async () => {
        const tempId = await genTempId();
        const localSchedule: CachedSchedule = {
          ...data,
          id: tempId,
          time: data.time || null,
          place: data.place || null,
          place_en: data.place_en || null,
          memo: data.memo || null,
          plan_b: data.plan_b || null,
          plan_c: data.plan_c || null,
          order_index: data.order_index || 0,
          rating: null,
          review: null,
          latitude: data.latitude || null,
          longitude: data.longitude || null,
          country_code: null,
          created_at: new Date().toISOString(),
          __local: { ...defaultLocalMeta, dirty: true, pendingSync: true, localUpdatedAt: Date.now() },
        };
        const db = await getDB();
        await db.put('schedules', localSchedule);
        await addOp(makeOp({
          planId: data.plan_id,
          entity: 'schedules',
          entityId: tempId,
          action: 'create',
          payload: data,
          parentRefs: { plan_id: data.plan_id },
        }));
        return localSchedule as Schedule;
      },
    );
  },

  update: async (id: number, data: Parameters<typeof schedulesAPI.update>[1]): Promise<Schedule> => {
    return serverFirstWrite(
      async () => {
        const schedule = await schedulesAPI.update(id, data);
        await cacheSchedules([withLocal(schedule)] as CachedSchedule[]);
        return schedule;
      },
      async () => {
        const db = await getDB();
        const existing = await db.get('schedules', id);
        if (!existing) throw new Error('Schedule not found in cache');
        const updated = { ...existing, ...data };
        updated.__local = { ...defaultLocalMeta, dirty: true, pendingSync: true, localUpdatedAt: Date.now() };
        await db.put('schedules', updated);
        await addOp(makeOp({
          planId: existing.plan_id,
          entity: 'schedules',
          entityId: id,
          action: 'update',
          payload: data,
          baseUpdatedAt: existing.created_at,
        }));
        return updated as Schedule;
      },
    );
  },

  delete: async (id: number): Promise<void> => {
    const doLocal = async () => {
      const db = await getDB();
      const existing = await db.get('schedules', id);
      if (!existing) return;

      if (isTempId(id)) {
        // Never synced: just remove locally + drop create ops
        await db.delete('schedules', id);
        // Remove related opLog entries
        const ops = await db.getAllFromIndex('opLog', 'by_entity_id', ['schedules', id]);
        const tx = db.transaction('opLog', 'readwrite');
        for (const op of ops) {
          await tx.store.delete(op.opId);
        }
        await tx.done;
      } else {
        // Mark deleted + queue
        existing.__local = { ...defaultLocalMeta, deleted: true, dirty: true, pendingSync: true, localUpdatedAt: Date.now() };
        await db.put('schedules', existing);
        await addOp(makeOp({
          planId: existing.plan_id,
          entity: 'schedules',
          entityId: id,
          action: 'delete',
          payload: {},
        }));
      }
    };

    return serverFirstWrite(
      async () => {
        await schedulesAPI.delete(id);
        const db = await getDB();
        await db.delete('schedules', id);
      },
      doLocal,
    );
  },
};

// ─── Moments API (offline-aware) ───

export const offlineMomentsAPI = {
  getByScheduleId: async (scheduleId: number): Promise<{ moments: Moment[]; count: number }> => {
    return serverFirstRead(
      () => momentsAPI.getByScheduleId(scheduleId),
      async () => {
        const cached = await getCachedMomentsBySchedule(scheduleId);
        return { moments: cached as Moment[], count: cached.length };
      },
      async (data) => {
        await cacheMoments(data.moments.map(m => withLocal(m)) as CachedMoment[]);
      },
    );
  },

  create: async (
    scheduleId: number,
    data: Parameters<typeof momentsAPI.create>[1],
  ): Promise<{ moment: Moment }> => {
    return serverFirstWrite(
      async () => {
        const result = await momentsAPI.create(scheduleId, data);
        await cacheMoments([withLocal(result.moment)] as CachedMoment[]);
        return result;
      },
      async () => {
        const tempId = await genTempId();
        const db = await getDB();
        // Need to find plan_id from schedule
        const schedule = await db.get('schedules', scheduleId);
        const moment: CachedMoment = {
          id: tempId,
          schedule_id: scheduleId,
          user_id: 0, // Will be resolved on sync
          photo_data: data.photo_data || null,
          note: data.note || null,
          mood: (data.mood as Moment['mood']) || null,
          rating: null,
          revisit: (data.revisit as Moment['revisit']) || null,
          created_at: new Date().toISOString(),
          __local: { ...defaultLocalMeta, dirty: true, pendingSync: true, localUpdatedAt: Date.now() },
        };
        await db.put('moments', moment);
        await addOp(makeOp({
          planId: schedule?.plan_id || 0,
          entity: 'moments',
          entityId: tempId,
          action: 'create',
          payload: { ...data, schedule_id: scheduleId },
          parentRefs: { schedule_id: scheduleId, plan_id: schedule?.plan_id },
        }));
        return { moment: moment as Moment };
      },
    );
  },

  update: async (momentId: number, data: Parameters<typeof momentsAPI.update>[1]): Promise<{ moment: Moment }> => {
    return serverFirstWrite(
      async () => {
        const result = await momentsAPI.update(momentId, data);
        await cacheMoments([withLocal(result.moment)] as CachedMoment[]);
        return result;
      },
      async () => {
        const db = await getDB();
        const existing = await db.get('moments', momentId);
        if (!existing) throw new Error('Moment not found');
        const updated = { ...existing, ...data } as CachedMoment;
        updated.__local = { ...defaultLocalMeta, dirty: true, pendingSync: true, localUpdatedAt: Date.now() };
        await db.put('moments', updated);
        const schedule = await db.get('schedules', existing.schedule_id);
        await addOp(makeOp({
          planId: schedule?.plan_id || 0,
          entity: 'moments',
          entityId: momentId,
          action: 'update',
          payload: data,
        }));
        return { moment: updated as Moment };
      },
    );
  },

  delete: async (momentId: number): Promise<void> => {
    return serverFirstWrite(
      async () => {
        await momentsAPI.delete(momentId);
        const db = await getDB();
        await db.delete('moments', momentId);
      },
      async () => {
        const db = await getDB();
        const existing = await db.get('moments', momentId);
        if (!existing) return;
        if (isTempId(momentId)) {
          await db.delete('moments', momentId);
          const ops = await db.getAllFromIndex('opLog', 'by_entity_id', ['moments', momentId]);
          const tx = db.transaction('opLog', 'readwrite');
          for (const op of ops) await tx.store.delete(op.opId);
          await tx.done;
        } else {
          existing.__local = { ...defaultLocalMeta, deleted: true, dirty: true, pendingSync: true, localUpdatedAt: Date.now() };
          await db.put('moments', existing);
          const schedule = await db.get('schedules', existing.schedule_id);
          await addOp(makeOp({
            planId: schedule?.plan_id || 0,
            entity: 'moments',
            entityId: momentId,
            action: 'delete',
            payload: {},
          }));
        }
      },
    );
  },
};

// ─── Members API (read-only cache, online-only writes) ───

export const offlineMembersAPI = {
  getByPlanId: async (planId: number): Promise<PlanMembersResponse> => {
    return serverFirstRead(
      () => membersAPI.getByPlanId(planId),
      async () => {
        const members = await getCachedMembersByPlan(planId);
        if (members.length === 0) return undefined;
        const owner = members.find(m => m.role === 'owner');
        if (!owner) return undefined;
        return {
          owner: { ...owner, joined_at: owner.joined_at || '' },
          members: members.filter(m => m.role !== 'owner').map(m => ({ ...m, joined_at: m.joined_at || '' })),
        } as PlanMembersResponse;
      },
    );
  },

  invite: async (planId: number, email: string) => {
    if (isOfflineMode() && !navigator.onLine) {
      throw new Error('멤버 초대는 온라인에서만 가능합니다.');
    }
    return membersAPI.invite(planId, email);
  },

  remove: async (planId: number, userId: number) => {
    if (isOfflineMode() && !navigator.onLine) {
      throw new Error('멤버 관리는 온라인에서만 가능합니다.');
    }
    return membersAPI.remove(planId, userId);
  },
};

// ─── Memos API (offline-aware) ───

const API_BASE = import.meta.env.DEV ? 'http://127.0.0.1:9999' : '';

function authHeaders(): Record<string, string> {
  const cred =
    localStorage.getItem('X-Auth-Credential') ||
    localStorage.getItem('x-auth-credential') ||
    localStorage.getItem('authCredential') ||
    localStorage.getItem('google_credential');
  return cred ? { 'X-Auth-Credential': cred, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

export const offlineMemosAPI = {
  getByPlanId: async (planId: number): Promise<TravelMemo[]> => {
    return serverFirstRead(
      async () => {
        const res = await fetch(`${API_BASE}/api/plans/${planId}/memos`, { headers: authHeaders() });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        return data.memos || [];
      },
      async () => {
        const cached = await getCachedMemosByPlan(planId);
        return cached as TravelMemo[];
      },
      async (memos: TravelMemo[]) => {
        await cacheMemos(memos.map(m => withLocal(m)) as CachedMemo[]);
      },
    );
  },

  create: async (planId: number, data: Partial<TravelMemo>): Promise<TravelMemo> => {
    return serverFirstWrite(
      async () => {
        const res = await fetch(`${API_BASE}/api/plans/${planId}/memos`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed');
        const result = await res.json();
        const memo = result.memo;
        await cacheMemos([withLocal(memo)] as CachedMemo[]);
        return memo;
      },
      async () => {
        const tempId = await genTempId();
        const memo: CachedMemo = {
          id: tempId,
          plan_id: planId,
          category: (data.category as any) || 'custom',
          title: data.title || '',
          content: data.content || null,
          icon: data.icon || null,
          order_index: data.order_index || 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          __local: { ...defaultLocalMeta, dirty: true, pendingSync: true, localUpdatedAt: Date.now() },
        };
        const db = await getDB();
        await db.put('travel_memos', memo);
        await addOp(makeOp({
          planId,
          entity: 'travel_memos',
          entityId: tempId,
          action: 'create',
          payload: { ...data, plan_id: planId },
          parentRefs: { plan_id: planId },
        }));
        return memo as TravelMemo;
      },
    );
  },

  update: async (planId: number, memoId: number, data: Partial<TravelMemo>): Promise<TravelMemo> => {
    return serverFirstWrite(
      async () => {
        const res = await fetch(`${API_BASE}/api/plans/${planId}/memos/${memoId}`, {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed');
        const result = await res.json();
        const memo = result.memo;
        await cacheMemos([withLocal(memo)] as CachedMemo[]);
        return memo;
      },
      async () => {
        const db = await getDB();
        const existing = await db.get('travel_memos', memoId);
        if (!existing) throw new Error('Memo not found');
        const updated = { ...existing, ...data, updated_at: new Date().toISOString() };
        updated.__local = { ...defaultLocalMeta, dirty: true, pendingSync: true, localUpdatedAt: Date.now() };
        await db.put('travel_memos', updated);
        await addOp(makeOp({
          planId,
          entity: 'travel_memos',
          entityId: memoId,
          action: 'update',
          payload: data,
          baseUpdatedAt: existing.updated_at,
        }));
        return updated as TravelMemo;
      },
    );
  },

  delete: async (planId: number, memoId: number): Promise<void> => {
    return serverFirstWrite(
      async () => {
        const res = await fetch(`${API_BASE}/api/plans/${planId}/memos/${memoId}`, {
          method: 'DELETE',
          headers: authHeaders(),
        });
        if (!res.ok) throw new Error('Failed');
        const db = await getDB();
        await db.delete('travel_memos', memoId);
      },
      async () => {
        const db = await getDB();
        const existing = await db.get('travel_memos', memoId);
        if (!existing) return;
        if (isTempId(memoId)) {
          await db.delete('travel_memos', memoId);
          const ops = await db.getAllFromIndex('opLog', 'by_entity_id', ['travel_memos', memoId]);
          const tx = db.transaction('opLog', 'readwrite');
          for (const op of ops) await tx.store.delete(op.opId);
          await tx.done;
        } else {
          existing.__local = { ...defaultLocalMeta, deleted: true, dirty: true, pendingSync: true, localUpdatedAt: Date.now() };
          await db.put('travel_memos', existing);
          await addOp(makeOp({
            planId,
            entity: 'travel_memos',
            entityId: memoId,
            action: 'delete',
            payload: {},
          }));
        }
      },
    );
  },
};

// ─── Status helper ───

export async function getOfflineStatus() {
  const counts = await countOpsByStatus();
  return {
    isOfflineMode: isOfflineMode(),
    pendingOps: counts.pending,
    failedOps: counts.failed,
    deadOps: counts.dead,
  };
}
