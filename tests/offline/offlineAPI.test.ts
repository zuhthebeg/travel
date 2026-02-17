/**
 * offlineAPI routing logic tests
 *
 * Tests the server-first + local fallback behavior.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  cachePlans,
  cacheSchedules,
  getCachedPlans,
  getCachedSchedulesByPlan,
  clearAllOfflineData,
  getPendingOps,
} from '../../src/lib/db';
import type { CachedPlan, CachedSchedule } from '../../src/lib/offline/types';
import { defaultLocalMeta } from '../../src/lib/offline/types';
import { isOfflineMode } from '../../src/lib/offlineAPI';

beforeEach(async () => {
  await clearAllOfflineData();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Helper ───

function makePlan(id: number): CachedPlan {
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
    visibility: 'private' as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    __local: { ...defaultLocalMeta },
  };
}

function makeSchedule(id: number, planId: number): CachedSchedule {
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
  };
}

// ─── Tests ───

describe('isOfflineMode', () => {
  it('returns false when not set', () => {
    expect(isOfflineMode()).toBe(false);
  });

  it('returns true when set', () => {
    localStorage.setItem('offline_mode', 'true');
    expect(isOfflineMode()).toBe(true);
  });
});

describe('Local cache read (simulating offline fallback)', () => {
  it('getCachedPlans returns cached data', async () => {
    await cachePlans([makePlan(1), makePlan(2)]);
    const plans = await getCachedPlans();
    expect(plans).toHaveLength(2);
  });

  it('getCachedSchedulesByPlan returns filtered data', async () => {
    await cacheSchedules([
      makeSchedule(1, 100),
      makeSchedule(2, 100),
      makeSchedule(3, 200),
    ]);
    const schedules = await getCachedSchedulesByPlan(100);
    expect(schedules).toHaveLength(2);
  });
});

describe('Blocked operations', () => {
  it('plan create is blocked when offline mode ON and no network', async () => {
    localStorage.setItem('offline_mode', 'true');

    // Mock navigator.onLine
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });

    const { offlinePlansAPI } = await import('../../src/lib/offlineAPI');

    await expect(offlinePlansAPI.create({
      title: 'New Trip',
      start_date: '2026-04-01',
      end_date: '2026-04-05',
    })).rejects.toThrow('온라인에서만');

    // Restore
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
  });

  it('member invite is blocked when offline mode ON and no network', async () => {
    localStorage.setItem('offline_mode', 'true');
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });

    const { offlineMembersAPI } = await import('../../src/lib/offlineAPI');

    await expect(offlineMembersAPI.invite(1, 'test@test.com'))
      .rejects.toThrow('온라인에서만');

    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
  });
});

describe('OpLog generation on local write', () => {
  it('schedule local write generates pending op', async () => {
    // Pre-cache a plan so schedule update can find it
    await cachePlans([makePlan(1)]);
    await cacheSchedules([makeSchedule(10, 1)]);

    // Simulate offline: set mode + make fetch fail
    localStorage.setItem('offline_mode', 'true');

    // Mock fetch to fail (simulating offline)
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    try {
      const { offlineSchedulesAPI } = await import('../../src/lib/offlineAPI');
      await offlineSchedulesAPI.update(10, { title: 'Updated Title' });

      const ops = await getPendingOps();
      expect(ops.length).toBeGreaterThanOrEqual(1);
      const op = ops.find(o => o.entityId === 10 && o.action === 'update');
      expect(op).toBeDefined();
      expect(op?.payload.title).toBe('Updated Title');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
