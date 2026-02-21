/**
 * Offline Bootstrap — V3
 *
 * When offline mode toggle is turned ON, downloads all accessible
 * trip data into IndexedDB for offline use.
 */
import { plansAPI, momentsAPI, membersAPI } from '../api';
import {
  cachePlans,
  cacheSchedules,
  cacheMemos,
  cacheDayNotes,
  cacheMoments,
  cacheMembers,
  setSyncMeta,
  getSyncMeta,
  setPlanSnapshot,
} from '../db';
import type { CachedDayNote } from './types';
import type {
  CachedPlan,
  CachedSchedule,
  CachedMoment,
  CachedMemo,
  CachedPlanMember,
  BootstrapProgress,
  LocalMeta,
} from './types';
import { defaultLocalMeta } from './types';

// ─── TravelMemos API (inline — not in api.ts yet as separate export) ───

const API_BASE_URL = import.meta.env.DEV ? 'http://127.0.0.1:9999' : '';

function getAuthHeaders(): Record<string, string> {
  const credential =
    localStorage.getItem('X-Auth-Credential') ||
    localStorage.getItem('x-auth-credential') ||
    localStorage.getItem('authCredential') ||
    localStorage.getItem('auth_credential') ||
    localStorage.getItem('temp_auth_credential') ||
    localStorage.getItem('google_credential');
  if (!credential) return {};
  return { 'X-Auth-Credential': credential };
}

async function fetchMemos(planId: number): Promise<any[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/plans/${planId}/memos`, {
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.memos || [];
  } catch {
    return [];
  }
}

// ─── State ───

type BootstrapListener = (progress: BootstrapProgress, status: string) => void;
const listeners = new Set<BootstrapListener>();
let abortController: AbortController | null = null;

export function onBootstrapProgress(fn: BootstrapListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(progress: BootstrapProgress, status: string) {
  listeners.forEach(fn => fn(progress, status));
}

// ─── Attach __local meta ───

function withLocal<T>(entity: T): T & { __local: LocalMeta } {
  return { ...entity, __local: { ...defaultLocalMeta, localUpdatedAt: Date.now() } };
}

// ─── Concurrency limiter ───

async function pMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency = 3,
): Promise<R[]> {
  const results: R[] = [];
  let i = 0;
  const run = async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

// ─── Main bootstrap ───

export async function runBootstrap(): Promise<void> {
  // Singleflight: check lock
  const existing = await getSyncMeta<string>('offlineBootstrapStatus');
  if (existing === 'in_progress') {
    console.log('[bootstrap] Already in progress, skipping');
    return;
  }

  abortController = new AbortController();
  await setSyncMeta('offlineBootstrapStatus', 'in_progress');

  const progress: BootstrapProgress = { total: 0, done: 0, failed: 0 };
  emit(progress, 'in_progress');

  try {
    // Step 1: Fetch plan list
    const plans = await plansAPI.getAll({ mine: true });
    progress.total = plans.length;
    emit(progress, 'in_progress');

    if (plans.length === 0) {
      await setSyncMeta('offlineBootstrapStatus', 'done');
      emit(progress, 'done');
      return;
    }

    // Cache plan list
    const cachedPlans = plans.map(p => withLocal(p)) as CachedPlan[];
    await cachePlans(cachedPlans);

    // Step 2: For each plan, fetch details
    await pMap(plans, async (plan) => {
      if (abortController?.signal.aborted) return;

      progress.currentPlanTitle = plan.title;
      emit(progress, 'in_progress');

      try {
        // Fetch schedules
        const { schedules } = await plansAPI.getById(plan.id);
        const cachedSchedules = schedules.map(s => withLocal(s)) as CachedSchedule[];
        await cacheSchedules(cachedSchedules);

        // Fetch memos
        const memos = await fetchMemos(plan.id);
        if (memos.length > 0) {
          const cachedMemos = memos.map(m => withLocal(m)) as CachedMemo[];
          await cacheMemos(cachedMemos);
        }

        // Fetch day notes
        try {
          const dnRes = await fetch(`${API_BASE_URL}/api/day-notes?plan_id=${plan.id}`, {
            headers: { ...getAuthHeaders() },
          });
          if (dnRes.ok) {
            const dnData = await dnRes.json();
            if (dnData.notes?.length) {
              await cacheDayNotes(dnData.notes.map((n: any) => withLocal(n)) as CachedDayNote[]);
            }
          }
        } catch {
          // day_notes fetch failure is non-critical
        }

        // Fetch members (read-only)
        try {
          const membersData = await membersAPI.getByPlanId(plan.id);
          const allMembers: CachedPlanMember[] = [
            membersData.owner,
            ...membersData.members,
          ].map(m => ({
            id: `${plan.id}:${m.user_id}`,
            plan_id: plan.id,
            user_id: m.user_id,
            username: m.username,
            email: m.email,
            picture: m.picture,
            role: m.role,
            joined_at: m.joined_at,
          }));
          await cacheMembers(plan.id, allMembers);
        } catch {
          // Members fetch may fail for non-authenticated, skip
        }

        // Fetch moments per schedule (batched)
        await pMap(schedules, async (schedule) => {
          try {
            const { moments } = await momentsAPI.getByScheduleId(schedule.id);
            if (moments.length > 0) {
              const cachedMoments = moments.map(m => withLocal(m)) as CachedMoment[];
              await cacheMoments(cachedMoments);
            }
          } catch {
            // Individual moment fetch failure is non-critical
          }
        }, 5);

        // Mark plan snapshot complete
        await setPlanSnapshot({
          planId: plan.id,
          lastFetchedAt: Date.now(),
          snapshotVersion: 1,
          isComplete: true,
        });

        progress.done++;
      } catch (err) {
        console.error(`[bootstrap] Failed to cache plan ${plan.id}:`, err);
        progress.failed++;

        await setPlanSnapshot({
          planId: plan.id,
          lastFetchedAt: Date.now(),
          snapshotVersion: 0,
          isComplete: false,
        });
      }

      emit(progress, 'in_progress');
    }, 2); // 2 plans in parallel

    const finalStatus = progress.failed > 0 && progress.done === 0 ? 'failed' : 'done';
    await setSyncMeta('offlineBootstrapStatus', finalStatus);
    await setSyncMeta('lastSyncAt', Date.now());
    if (finalStatus === 'done') {
      await setSyncMeta('lastSyncSuccessAt', Date.now());
    }
    emit(progress, finalStatus);

  } catch (err: any) {
    console.error('[bootstrap] Fatal error:', err);
    await setSyncMeta('offlineBootstrapStatus', 'failed');
    progress.failed = progress.total;
    emit(progress, 'failed');
  }
}

// ─── Cancel ───

export function cancelBootstrap(): void {
  abortController?.abort();
}

// ─── Lightweight refresh (keep-warm) ───

let refreshInterval: ReturnType<typeof setInterval> | null = null;

export function startKeepWarm(intervalMs = 5 * 60 * 1000): void {
  stopKeepWarm();
  refreshInterval = setInterval(async () => {
    if (!navigator.onLine) return;
    const status = await getSyncMeta<string>('offlineBootstrapStatus');
    if (status !== 'done') return;

    try {
      // Lightweight: just re-fetch plan list + schedules
      const plans = await plansAPI.getAll({ mine: true });
      const cachedPlans = plans.map(p => withLocal(p)) as CachedPlan[];
      await cachePlans(cachedPlans);

      for (const plan of plans) {
        try {
          const { schedules } = await plansAPI.getById(plan.id);
          const cachedSchedules = schedules.map(s => withLocal(s)) as CachedSchedule[];
          await cacheSchedules(cachedSchedules);
        } catch { /* skip individual failures */ }
      }

      await setSyncMeta('lastSyncAt', Date.now());
    } catch {
      // Network errors during keep-warm are non-fatal
    }
  }, intervalMs);
}

export function stopKeepWarm(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}
