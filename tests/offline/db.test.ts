import { describe, it, expect, beforeEach } from 'vitest';
import {
  getDB,
  cachePlans,
  cacheSchedules,
  cacheMemos,
  getCachedPlans,
  getCachedPlan,
  getCachedSchedulesByPlan,
  getCachedMemosByPlan,
  addOp,
  getPendingOps,
  updateOpStatus,
  countOpsByStatus,
  getSyncMeta,
  setSyncMeta,
  setPlanSnapshot,
  getPlanSnapshot,
  clearAllOfflineData,
} from '../../src/lib/db';
import type { CachedPlan, CachedSchedule, CachedMemo, OpLogEntry } from '../../src/lib/offline/types';
import { defaultLocalMeta } from '../../src/lib/offline/types';

beforeEach(async () => {
  await clearAllOfflineData();
});

// ─── Helper factories ───

function makePlan(id: number, overrides: Partial<CachedPlan> = {}): CachedPlan {
  return {
    id,
    user_id: 1,
    title: `Plan ${id}`,
    region: 'Tokyo',
    country: 'Japan',
    country_code: 'JP',
    start_date: '2026-03-01',
    end_date: '2026-03-05',
    thumbnail: null,
    is_public: false,
    visibility: 'private',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    __local: { ...defaultLocalMeta },
    ...overrides,
  };
}

function makeSchedule(id: number, planId: number, overrides: Partial<CachedSchedule> = {}): CachedSchedule {
  return {
    id,
    plan_id: planId,
    date: '2026-03-01',
    time: '10:00',
    title: `Schedule ${id}`,
    place: 'Shibuya',
    place_en: 'Shibuya',
    memo: null,
    plan_b: null,
    plan_c: null,
    order_index: 0,
    rating: null,
    review: null,
    latitude: null,
    longitude: null,
    country_code: null,
    created_at: new Date().toISOString(),
    __local: { ...defaultLocalMeta },
    ...overrides,
  };
}

function makeOp(overrides: Partial<OpLogEntry> = {}): OpLogEntry {
  return {
    opId: crypto.randomUUID(),
    planId: 1,
    entity: 'schedules',
    entityId: -1,
    action: 'create',
    payload: { title: 'New' },
    status: 'pending',
    retryCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

// ─── Tests ───

describe('Plans cache', () => {
  it('caches and retrieves plans', async () => {
    await cachePlans([makePlan(1), makePlan(2)]);
    const plans = await getCachedPlans();
    expect(plans).toHaveLength(2);
    expect(plans.map(p => p.id).sort()).toEqual([1, 2]);
  });

  it('filters out deleted plans', async () => {
    await cachePlans([
      makePlan(1),
      makePlan(2, { __local: { ...defaultLocalMeta, deleted: true } }),
    ]);
    const plans = await getCachedPlans();
    expect(plans).toHaveLength(1);
    expect(plans[0].id).toBe(1);
  });

  it('getCachedPlan returns undefined for deleted', async () => {
    await cachePlans([makePlan(1, { __local: { ...defaultLocalMeta, deleted: true } })]);
    const plan = await getCachedPlan(1);
    expect(plan).toBeUndefined();
  });
});

describe('Schedules cache', () => {
  it('filters by plan_id', async () => {
    await cacheSchedules([
      makeSchedule(1, 100),
      makeSchedule(2, 100),
      makeSchedule(3, 200),
    ]);
    const s100 = await getCachedSchedulesByPlan(100);
    expect(s100).toHaveLength(2);
    const s200 = await getCachedSchedulesByPlan(200);
    expect(s200).toHaveLength(1);
  });
});

describe('OpLog', () => {
  it('adds and retrieves pending ops', async () => {
    await addOp(makeOp({ opId: 'op1' }));
    await addOp(makeOp({ opId: 'op2' }));
    const pending = await getPendingOps();
    expect(pending).toHaveLength(2);
  });

  it('updateOpStatus changes status and increments retry on failure', async () => {
    await addOp(makeOp({ opId: 'op1' }));
    await updateOpStatus('op1', 'failed', 'Network error');
    const db = await getDB();
    const op = await db.get('opLog', 'op1');
    expect(op?.status).toBe('failed');
    expect(op?.retryCount).toBe(1);
    expect(op?.lastError).toBe('Network error');
  });

  it('countOpsByStatus counts correctly', async () => {
    await addOp(makeOp({ opId: 'op1', status: 'pending' }));
    await addOp(makeOp({ opId: 'op2', status: 'pending' }));
    await addOp(makeOp({ opId: 'op3', status: 'failed' } as any));
    // op3 status is set directly, need to add it properly
    const db = await getDB();
    const op3 = await db.get('opLog', 'op3');
    if (op3) {
      op3.status = 'failed';
      await db.put('opLog', op3);
    }
    const counts = await countOpsByStatus();
    expect(counts.pending).toBe(2);
    expect(counts.failed).toBe(1);
  });
});

describe('SyncMeta', () => {
  it('get/set works', async () => {
    await setSyncMeta('testKey', 42);
    const val = await getSyncMeta<number>('testKey');
    expect(val).toBe(42);
  });

  it('returns undefined for missing key', async () => {
    const val = await getSyncMeta('nonexistent');
    expect(val).toBeUndefined();
  });
});

describe('PlanSnapshot', () => {
  it('stores and retrieves snapshot metadata', async () => {
    await setPlanSnapshot({
      planId: 1,
      lastFetchedAt: Date.now(),
      snapshotVersion: 1,
      isComplete: true,
    });
    const snap = await getPlanSnapshot(1);
    expect(snap?.isComplete).toBe(true);
    expect(snap?.planId).toBe(1);
  });
});

describe('clearAllOfflineData', () => {
  it('clears everything', async () => {
    await cachePlans([makePlan(1)]);
    await addOp(makeOp());
    await clearAllOfflineData();
    const plans = await getCachedPlans();
    const ops = await getPendingOps();
    expect(plans).toHaveLength(0);
    expect(ops).toHaveLength(0);
  });
});
