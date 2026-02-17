# OFFLINE_DB_REVIEW

## Summary Verdict
**Needs changes** (good foundation, but several schema/sync gaps should be resolved before implementation).

---

## Issue List

### 1) Schema coverage does not fully match current TypeScript domain
- **Severity:** warning
- **What I found:** Design only defines `plans`, `schedules`, `moments`, `pendingChanges`, `syncMeta` stores.
- **Why it matters:** Current `types.ts` + `api.ts` include additional server-backed entities/flows:
  - `reviews` (`reviewsAPI`)
  - `members` (`membersAPI`)
  - potentially `TravelMemo` (type exists, likely future API)
- **Impact:** Offline behavior may be inconsistent (some views fully offline, others suddenly online-only).
- **Recommendation:** Explicitly document offline scope by entity (supported vs intentionally excluded). If excluded, make UI degrade gracefully and show clear offline-disabled messaging.

### 2) `pendingChanges` shape is too weak for robust create/update/delete replay
- **Severity:** critical
- **What I found:** `PendingChange` has only `entity`, `entityId`, `action`, `data`, `planId`, `timestamp`, `synced`.
- **Why it matters:** This is insufficient for:
  - mapping temp IDs to real IDs after create
  - preserving parent-child relationships (e.g., new schedule + new moments under it)
  - idempotent retries and deduplication
  - conflict-safe replay after app restarts
- **Recommendation:** Extend queue records with fields like:
  - `clientChangeId` (UUID)
  - `opGroupId` (batch/transaction group)
  - `baseVersion` / `baseUpdatedAt` (optimistic concurrency context)
  - `tempId` + `serverId` (or separate mapping table)
  - `dependsOnChangeIds` (for child ops)
  - `retryCount`, `lastError`, `nextRetryAt`
  - `status`: `pending | syncing | failed | synced | dead_letter`

### 3) Create with server-assigned IDs is under-specified
- **Severity:** critical
- **What I found:** Design says `entityId: 0 if new`, then “POST and update local”.
- **Why it matters:** Without strict temp-ID strategy, local references break (especially schedule→moment). Deletes/updates on temp entities are ambiguous.
- **Recommendation:**
  - Use deterministic client temp IDs (e.g., negative int or `tmp_<uuid>` string).
  - Add `idMap` store (or `syncMeta` map) per entity: `{ tempId, serverId, createdAt }`.
  - During sync, process creates first within dependency graph and rewrite queued downstream operations (`entityId`, FK fields) from temp→server ID atomically.

### 4) Sync order by plain timestamp is unsafe for relational ops
- **Severity:** critical
- **What I found:** Current order is strictly timestamp ascending across all actions.
- **Why it matters:** Can fail in common sequences:
  - create parent → create child → update parent (OK only if preserved)
  - delete before unsynced create of same temp entity
  - rapid update+delete where stale update is replayed after delete in retry scenarios
- **Recommendation:** Replay by **dependency-aware ordering**, not only timestamp:
  1. collapse queue per entity (coalesce redundant updates)
  2. resolve canceling ops (`create` then `delete` before sync => drop both)
  3. topological order: parent creates → child creates → updates → deletes children → deletes parents
  4. keep timestamp as tie-breaker only

### 5) `photo_data` caching decision is directionally right but needs explicit policy
- **Severity:** warning
- **What I found:** Design says image upload offline is excluded due to size.
- **Why it matters:** `Moment.photo_data` exists and can be huge; accidental caching may exhaust quota quickly on mobile.
- **Recommendation:**
  - Default: **exclude base64 blob from persistent IndexedDB cache** for list/detail hydration.
  - Option A (safer): cache metadata only, fetch image online.
  - Option B (if offline photo is required): store compressed Blob in separate `media` store with LRU + hard cap (e.g., 100–200MB) and eviction.
  - Never store full-size base64 strings in main entity rows.

### 6) Missing conflict/version strategy beyond “server wins”
- **Severity:** warning
- **What I found:** Last-write-wins/server-authoritative is stated, but no version check inputs are stored.
- **Why it matters:** Silent data loss risk when user edits stale local data.
- **Recommendation:** Persist `updated_at` snapshot per edited row and send conditional metadata (if API allows). If not, at least detect mismatch post-sync and mark UI toast/flag for “your offline edit was overwritten”.

### 7) Race conditions around online event + app startup sync
- **Severity:** warning
- **What I found:** Sync triggers on both `online` event and app start.
- **Why it matters:** Dual triggers can cause concurrent sync workers and duplicate requests.
- **Recommendation:** Add a cross-tab lock / singleflight guard:
  - in-memory mutex + `navigator.locks` fallback
  - queue worker state machine (`idle/syncing/backoff`)
  - one active sync at a time

### 8) `offlineAPI` wrapper is workable but can become fragmented
- **Severity:** suggestion
- **What I found:** Proposed per-API wrapper pattern is simple and pragmatic.
- **Concern:** Business logic can spread across wrappers and components (cache write paths duplicated).
- **Recommendation:** Keep wrapper, but centralize policies:
  - `Repository` layer per entity (`PlanRepository`, `ScheduleRepository`, `MomentRepository`)
  - wrappers call repositories; repositories encapsulate cache/read-through/write-through/queue rules
  - easier testing and future migration (e.g., Dexie/RxDB)

### 9) IndexedDB mobile quota and persistence not addressed
- **Severity:** warning
- **What I found:** No quota/eviction plan in design.
- **Why it matters:** Mobile browsers may evict storage under pressure, especially large blobs.
- **Recommendation:**
  - call `navigator.storage.estimate()` and monitor usage
  - request durable storage via `navigator.storage.persist()` when available
  - define per-store budgets and cleanup policy (LRU by `updated_at`/last accessed)
  - surface UX warnings when near quota

---

## Recommended Design Changes (Concrete)

1. **Expand data model spec**
   - Add explicit “offline supported entities matrix” (plans/schedules/moments/reviews/members/etc).
   - Include omitted stores or clearly document intentional exclusion.

2. **Upgrade queue model**
   - Replace minimal `pendingChanges` with durable operation log (UUIDs, dependency, retry, status).

3. **Add temp-ID mapping layer**
   - New `idMap` store and deterministic temp IDs.
   - Ensure FK rewrite for queued operations after create success.

4. **Adopt operation compaction before sync**
   - Coalesce update chains.
   - Drop no-op pairs (create+delete unsynced).
   - Resolve invalid sequences early.

5. **Define media policy**
   - Exclude `photo_data` by default from entity cache.
   - If needed, isolated Blob store + hard cap + eviction.

6. **Add sync concurrency guards**
   - Single sync worker lock (cross-tab safe).
   - Exponential backoff for transient failures.

7. **Add observability fields**
   - `syncMeta`: last success/failure, queue length, last error summary.
   - Useful for support/debug and UX badges.

---

## Suggested Code Patterns

- **Repository + SyncQueue pattern**
  - `repositories/*.ts` for CRUD abstraction
  - `SyncQueue` service for enqueue/compact/replay
  - `SyncOrchestrator` for triggers (`online`, startup, manual retry)

- **Transactional local writes**
  - For each local mutation: update entity + enqueue change in one IndexedDB transaction.

- **State machine sync worker**
  - states: `idle -> preparing -> syncing -> reconciling -> done|backoff`
  - prevents duplicate workers and clarifies retry behavior.

- **Conflict annotation instead of silent overwrite**
  - mark records with `localConflict: true` if server overwrite detected
  - UI can show non-blocking alert.

- **Progressive offline scope**
  - Phase 1: plans/schedules read + schedule update/delete
  - Phase 2: create flows + temp ID mapping
  - Phase 3: moments/reviews media strategy

---

## Final Note
The design direction is solid (IndexedDB + queue + wrapper), but ID mapping, dependency-aware sync, and quota/media policy are currently the biggest blockers. Address those first to avoid brittle behavior once real offline edits accumulate.