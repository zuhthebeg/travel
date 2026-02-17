/**
 * Offline V3 — Types
 *
 * All IndexedDB entity shapes, opLog, idMap, mediaQueue, syncMeta.
 */
import type { Plan, Schedule, Moment, TravelMemo } from '../../store/types';

// ─── Local metadata attached to cached entities ───

export interface LocalMeta {
  dirty: boolean;
  deleted: boolean;
  conflict: boolean;
  localUpdatedAt: number; // Date.now()
  pendingSync: boolean;
}

export const defaultLocalMeta: LocalMeta = {
  dirty: false,
  deleted: false,
  conflict: false,
  localUpdatedAt: 0,
  pendingSync: false,
};

// ─── Cached entity wrappers (server shape + __local) ───

export type CachedPlan = Plan & { __local: LocalMeta };
export type CachedSchedule = Schedule & { __local: LocalMeta };
export type CachedMoment = Moment & { __local: LocalMeta };
export type CachedMemo = TravelMemo & { __local: LocalMeta };

// plan_members: read-only cache, no __local needed
export interface CachedPlanMember {
  id: string; // `${plan_id}:${user_id}`
  plan_id: number;
  user_id: number;
  username: string;
  email: string;
  picture: string | null;
  role: 'owner' | 'member';
  joined_at?: string;
}

// ─── User profile cache ───

export interface CachedUserProfile {
  id: number;
  username: string;
  email: string | null;
  picture: string | null;
  provider: string;
}

// ─── OpLog ───

export type OpEntity = 'plans' | 'schedules' | 'moments' | 'travel_memos' | 'comments';
export type OpAction = 'create' | 'update' | 'delete';
export type OpStatus = 'pending' | 'syncing' | 'done' | 'failed' | 'dead';

export interface OpLogEntry {
  opId: string;                    // crypto.randomUUID()
  planId: number;
  entity: OpEntity;
  entityId: number | string;      // negative = temp
  action: OpAction;
  payload: Record<string, any>;   // minimal patch for update, full for create
  baseUpdatedAt?: string | null;  // for conflict detection
  parentRefs?: {
    plan_id?: number;
    schedule_id?: number;
  };
  dependsOn?: string[];           // opIds this depends on
  status: OpStatus;
  retryCount: number;
  lastError?: string;
  createdAt: number;               // Date.now()
  updatedAt: number;
}

// ─── IdMap ───

export interface IdMapping {
  mapKey: string;    // `${entity}:${tempId}`
  entity: OpEntity;
  tempId: number;
  serverId: number;
  mappedAt: number;
}

// ─── MediaQueue ───

export type MediaStatus = 'pending' | 'uploading' | 'done' | 'failed';

export interface MediaQueueEntry {
  localRef: string;               // uuid
  planId: number;
  momentId: number;               // temp or server
  blob: Blob;
  mimeType: string;
  fileName: string;
  size: number;
  previewUrl?: string;
  status: MediaStatus;
  retryCount: number;
  lastError?: string;
  createdAt: number;
}

// ─── SyncMeta ───

export interface SyncMetaEntry {
  key: string;
  value: any;
}

// Well-known syncMeta keys
export type SyncMetaKey =
  | 'nextTempId'
  | 'lastSyncAt'
  | 'lastSyncSuccessAt'
  | 'lastSyncErrorAt'
  | 'failedCount'
  | 'deadLetterCount'
  | 'pendingCount'
  | 'syncLockOwner'
  | 'offlineBootstrapStatus'  // 'idle' | 'in_progress' | 'done' | 'failed'
  | 'bootstrapProgress';      // { total: number, done: number }

// ─── Plan snapshot metadata ───

export interface PlanSnapshotMeta {
  key: string;          // `plan:${planId}`
  planId: number;
  lastFetchedAt: number;
  snapshotVersion: number;
  isComplete: boolean;
}

// ─── Bootstrap progress ───

export interface BootstrapProgress {
  total: number;
  done: number;
  failed: number;
  currentPlanTitle?: string;
}

// ─── Offline mode state (for UI consumption) ───

export interface OfflineDataState {
  status: 'idle' | 'bootstrapping' | 'ready' | 'error';
  progress: BootstrapProgress | null;
  error?: string;
  lastSyncAt?: number;
  pendingOps: number;
  failedOps: number;
}
