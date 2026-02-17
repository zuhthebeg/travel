# OFFLINE FULL REVIEW — Travly (Final Pre-Implementation)

Date: 2026-02-18
Scope: **Trip-scoped offline mode** (selected `plan` only), with local WebLLM already available.

---

## 1) Data Scope (Clone / Offline CRUD / Sync)

Decision principle:
- **Trip-core entities** (plan/schedules/moments/memos/comments) => full offline support.
- **Identity & permissions entities** => mostly cached/read-only offline.
- **Cross-plan/global/social/discovery entities** => online-first, limited cache only.
- **Leveling data** => derive on server; offline preview optional, server-authoritative.

### 1.1 `plans` (selected trip only)
- Clone: **Yes** (only selected plan, not all plans)
- Offline CRUD: **Update only** (title/region/dates/thumbnail/visibility), no offline create/delete for v1
- Sync back: **Yes (premium)**
- Why: Plan metadata is needed for UI and AI context. Offline create/delete creates multi-entity dependency and ownership/security complexity; postpone to v2.

### 1.2 `schedules` (all schedules in selected plan)
- Clone: **Yes**
- Offline CRUD: **Full CRUD**
- Sync back: **Yes (premium)**
- Why: Core trip-edit workload during travel. Required by assistant actions and timeline/calendar UI.

### 1.3 `moments` (all moments for selected plan’s schedules)
- Clone: **Yes**
- Offline CRUD: **Full CRUD**
- Sync back: **Yes (premium)**
- Why: Core diary/photo use case. Must work fully offline including local media capture.

### 1.4 `travel_memos`
- Clone: **Yes**
- Offline CRUD: **Full CRUD**
- Sync back: **Yes (premium)**
- Why: This is explicitly part of requested offline editing and assistant actions (`add_memo/update_memo/delete_memo`).

### 1.5 `plan_members`
- Clone: **Yes** (owner + members list for selected plan)
- Offline CRUD: **No (read-only cached)**
- Sync back: **No offline mutation** (online-only for invite/remove)
- Why: Membership is security-sensitive and identity-bound; must validate server-side current auth/ownership.

### 1.6 `comments` (schedule comments)
- Clone: **Yes** (for selected plan’s schedules)
- Offline CRUD: **Full CRUD** (if product wants parity) OR **Create-only + own-delete** (safer v1)
- Sync back: **Yes (premium)**
- Why: If comments are used inside trip collaboration offline, must queue writes. If low-priority, can ship as read-only in phase 1 and enable write in phase 2.

### 1.7 `user profile` (current user)
- Clone: **Yes** (minimal cache: id, username, email, picture, provider)
- Offline CRUD: **No**
- Sync back: N/A
- Why: Needed for attribution/rendering and ACL-aware UI, but profile mutation is outside trip scope.

### 1.8 `xp_events`, `badges`, `user_badges`, `visited_places` (level system)
- Clone: **Partial**
  - `badges` definitions: **Yes** (static, cacheable)
  - `user_badges` / level snapshot: **Yes (read cache)**
  - `xp_events`, `visited_places`: **No write clone for v1**
- Offline CRUD: **No direct offline write**
- Sync back: **Server-derived only**
- Why: XP/badge awarding currently occurs server-side at action execution time. If replayed offline writes trigger server ops later, server can grant XP idempotently then. Keep progression **server-authoritative** to avoid cheating/inconsistency.

---

## 2) IndexedDB Schema (Concrete)

DB name: `travly-offline`  
Version: `2` (new final schema)

## 2.1 Domain stores

### `plans`
- keyPath: `id` (number; temp negative allowed only if future create-plan enabled)
- indexes:
  - `by_user_id` => `user_id`
  - `by_updated_at` => `updated_at`
- fields: full plan row + `__local` metadata (`dirty`, `deleted`, `localUpdatedAt`)

### `schedules`
- keyPath: `id`
- indexes:
  - `by_plan_id` => `plan_id`
  - `by_plan_date` => `[plan_id, date]`
  - `by_plan_order` => `[plan_id, date, order_index]`
  - `by_local_updated` => `__local.localUpdatedAt`

### `moments`
- keyPath: `id`
- indexes:
  - `by_schedule_id` => `schedule_id`
  - `by_user_id` => `user_id`
  - `by_schedule_created` => `[schedule_id, created_at]`

### `travel_memos`
- keyPath: `id`
- indexes:
  - `by_plan_id` => `plan_id`
  - `by_plan_category` => `[plan_id, category]`
  - `by_plan_order` => `[plan_id, order_index]`

### `comments`
- keyPath: `id`
- indexes:
  - `by_schedule_id` => `schedule_id`
  - `by_schedule_created` => `[schedule_id, created_at]`

### `plan_members`
- keyPath: `id` = `${plan_id}:${user_id}` (string composite)
- indexes:
  - `by_plan_id` => `plan_id`
  - `by_user_id` => `user_id`

### `user_profile`
- keyPath: `id` (single current user row)

### `level_cache` (read cache)
- keyPath: `key`
- rows:
  - `my_level`
  - `badges_catalog`
  - `user_badges:<userId>`

## 2.2 Sync/system stores

### `opLog`
- keyPath: `opId` (UUID)
- indexes:
  - `by_status_created` => `[status, createdAt]`
  - `by_entity` => `entity`
  - `by_entity_id` => `[entity, entityId]`
  - `by_plan_id` => `planId`
- shape:
```ts
{
  opId: string;
  planId: number;
  entity: 'plans'|'schedules'|'moments'|'travel_memos'|'comments';
  entityId: number|string;      // temp negative or composite id
  action: 'create'|'update'|'delete';
  payload: Record<string, any>; // minimal patch for update
  baseUpdatedAt?: string|null;  // optimistic conflict hint
  parentRefs?: { plan_id?: number; schedule_id?: number };
  dependsOn?: string[];
  status: 'pending'|'syncing'|'done'|'failed'|'dead';
  retryCount: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}
```

### `idMap`
- keyPath: `mapKey` where `mapKey = `${entity}:${tempId}``
- indexes:
  - `by_entity_temp` => `[entity, tempId]`
  - `by_entity_server` => `[entity, serverId]`
- shape: `{ entity, tempId, serverId, mappedAt }`

### `mediaQueue`
- keyPath: `localRef` (uuid)
- indexes:
  - `by_moment_id` => `momentId`
  - `by_status_created` => `[status, createdAt]`
  - `by_plan_id` => `planId`
- shape:
```ts
{
  localRef: string;
  planId: number;
  momentId: number;             // temp/server id
  blob: Blob;
  mimeType: string;
  fileName: string;
  size: number;
  previewUrl?: string;
  status: 'pending'|'uploading'|'done'|'failed';
  retryCount: number;
  lastError?: string;
  createdAt: number;
}
```

### `syncMeta`
- keyPath: `key`
- required keys:
  - `nextTempId` (number, start `-1`, decremented transactionally)
  - `lastSyncAt`
  - `lastSyncSuccessAt`
  - `lastSyncErrorAt`
  - `failedCount`
  - `deadLetterCount`
  - `pendingCount`
  - `syncLockOwner`
  - `premiumSyncEnabled`
  - `activePlanId`

---

## 3) Offline API Surface (All current endpoints)

Legend:
- **Offline-Local**: works via IndexedDB/opLog
- **Offline-RO Cache**: readable only from cache
- **Online-only**: disabled offline with reason

### Core plans/schedules/moments/memos/comments/reviews
- `GET /api/plans` -> **Offline-RO Cache** (cached list; stale banner)
- `POST /api/plans` -> **Online-only** (auth/ownership/global create)
- `GET /api/plans/:id` -> **Offline-Local** (selected plan only)
- `PUT /api/plans/:id` -> **Offline-Local** (queue update)
- `DELETE /api/plans/:id` -> **Online-only** (destructive/global)

- `GET /api/schedules?plan_id=` -> **Offline-Local**
- `POST /api/schedules` -> **Offline-Local**
- `GET /api/schedules/:id` -> **Offline-Local**
- `PUT /api/schedules/:id` -> **Offline-Local**
- `DELETE /api/schedules/:id` -> **Offline-Local**
- `POST /api/schedules/from-text` -> **Offline-Local equivalent** (handled by local AI parser; no server call)

- `GET /api/schedules/:id/moments` -> **Offline-Local**
- `POST /api/schedules/:id/moments` -> **Offline-Local** (with `mediaQueue`)
- `PUT /api/moments/:id` -> **Offline-Local**
- `DELETE /api/moments/:id` -> **Offline-Local**

- `GET /api/plans/:id/memos` -> **Offline-Local**
- `POST /api/plans/:id/memos` -> **Offline-Local**
- `GET /api/plans/:id/memos/:memoId` -> **Offline-Local**
- `PUT /api/plans/:id/memos/:memoId` -> **Offline-Local**
- `DELETE /api/plans/:id/memos/:memoId` -> **Offline-Local**
- `POST /api/plans/:id/memos/generate` -> **Offline-Local equivalent** (local AI generate, then local writes)

- `GET /api/schedules/:id/comments` -> **Offline-Local** (if cloned)
- `POST /api/schedules/:id/comments` -> **Offline-Local** (queued)
- `DELETE /api/comments/:id` -> **Offline-Local** (queued)

- `GET /api/schedules/:id/reviews` -> **Offline-RO Cache** (optional)
- `POST /api/schedules/:id/reviews` -> **Online-only** (base64-heavy legacy path; not in offline scope)
- `DELETE /api/reviews/:id` -> **Online-only**

### Members / sharing / invite / fork
- `GET /api/plans/:id/members` -> **Offline-RO Cache**
- `POST /api/plans/:id/members` -> **Online-only**
- `DELETE /api/plans/:id/members/:userId` -> **Online-only**

- `POST /api/plans/:id/invite` -> **Online-only**
- `GET /api/plans/:id/invite` -> **Online-only**
- `GET /api/invite/:code` -> **Online-only**
- `POST /api/invite/:code` -> **Online-only**

- `POST /api/plans/:id/fork` -> **Online-only**

### Album / profile / level / social timeline
- `GET /api/plans/:id/album` -> **Offline-RO Cache** (selected plan album view)
- `GET /api/my/moments` -> **Offline-RO Cache (partial)** (only cloned plan subset)

- `POST /api/auth/google` -> **Online-only**

- `GET /api/my/level` -> **Offline-RO Cache** (last snapshot only)
- `GET /api/users/:id/level` -> **Online-only**

### AI/general utilities/media/geocode
- `POST /api/assistant` -> **Offline-Local equivalent** (local model + action executor)
- `POST /api/assistant/chat` -> **Offline-Local equivalent** (chat only)
- `POST /api/assistant/generate-draft` -> **Offline-Local equivalent**
- `POST /api/assistant/parse-plan` -> **Offline-Local equivalent**
- `POST /api/schedules/from-text` -> **Offline-Local equivalent**

- `GET /api/geocode` -> **Online-only** (external Photon)
- `POST /api/plans/:id/geocode-schedules` -> **Online-only**

- `GET/POST/PUT/DELETE /api/notes` -> **Online-only** (legacy `trip_notes`, not target scope)

- `POST /api/upload` -> **Offline-local capture only** (queue), actual upload **online sync phase**
- `GET /api/images/:key` -> **Offline-RO cache if already fetched**, else online-only

---

## 4) AI Assistant Offline Capabilities

Reference: `functions/api/assistant/index.ts` action types.

## 4.1 Action support matrix

### Works offline (local DB execution)
1. `add`
2. `update`
3. `delete`
4. `shift_all`
5. `delete_matching`
6. `update_plan`
7. `add_memo`
8. `update_memo`
9. `delete_memo`
10. `generate_memos` (local AI generates concrete memo actions)
11. `add_moment`
12. `update_moment`
13. `delete_moment`

### Online-only (blocked offline)
14. `add_member`
15. `remove_member`
16. `set_visibility` (can be allowed offline technically, but recommend online-only in v1 due to access/sharing side effects)
17. image remote analysis relying on cloud vision endpoints (local VLM not present)

> Note: `set_visibility` can be queued as offline update if product wants full plan metadata edit parity. If enabled, enforce owner-only UI and sync-time ACL failure handling.

## 4.2 Local AI execution flow

1) User prompt -> local WebLLM (`offlineEngine.ts`) with same JSON contract:
```json
{ "reply": "...", "actions": [ ... ] }
```
2) Client validates each action against local ACL (owner/member capabilities) and schema constraints.
3) Execute action in IndexedDB transaction:
- mutate domain store
- append `opLog` entry atomically
4) Return conversational reply + local action results to UI.
5) If media involved (`add_moment` with photo): store Blob in `mediaQueue`, attach `localRef` to moment.

---

## 5) Sync Engine Specification

Premium-only outbound sync; free tier keeps local-only queue.

## 5.1 Triggering
- on `online` event
- app startup
- manual “Sync now”
- upgrade free->premium (flush queued ops)

All guarded by singleflight lock:
- `navigator.locks` if available
- fallback lock in `syncMeta` with heartbeat timeout

## 5.2 Phases (dependency-ordered)

### Phase 0: Prepare
- check premium entitlement
- load pending ops
- run **op compaction**
- resolve temp-id dependencies graph

### Phase 1: Create parent-first
1. `plans` create (if ever enabled)
2. `schedules` create
3. `travel_memos/comments/moments` create

For each successful create:
- write `idMap`
- rewrite entity IDs/FKs in domain stores
- rewrite pending op references in one transaction

### Phase 2: Updates
- process `update` ops by entity priority then time
- use `baseUpdatedAt` when available to detect conflicts

### Phase 3: Deletes child-first
- `comments` / `moments` / `travel_memos` -> `schedules` -> `plans`

### Phase 4: Media upload
- for each `mediaQueue pending` item:
  - resolve server `momentId` via `idMap`
  - compress if needed
  - upload (existing endpoint or moment update path)
  - mark done/failed

### Phase 5: Reconcile
- refetch selected trip snapshot from server
- replace local trip stores (preserving unsynced failed ops flags)
- update `lastSyncSuccessAt`

## 5.3 Temp ID strategy
- Persist allocator in `syncMeta.nextTempId`
- allocate IDs transactionally to avoid multi-tab collision
- use global negative integers across all entities OR composite keys

## 5.4 Op compaction rules
1. `create` + `delete` (same unsynced entity) => drop both
2. multiple `update` => merge into one patch
3. `create` + `update` => single `create` with merged payload
4. `delete` overrides prior `update`
5. drop no-op update (empty diff)

## 5.5 Conflict resolution
- Default: server-authoritative with client conflict marking
- If server row changed since `baseUpdatedAt`:
  - mark op `failed/conflict`
  - keep local shadow flag `__local.conflict = true`
  - show conflict center UI (retry overwrite / discard local)

## 5.6 Error handling/retry
- transient (5xx/network): exponential backoff + jitter, max 5 retries/op
- auth errors (401/403): pause queue, require re-login
- validation errors (400): mark `dead`, surface actionable message
- partial failures do not block unrelated ops

## 5.7 Premium gating behavior
- Non-premium:
  - local CRUD still allowed
  - queue retained but unsent
  - clear badge: “Local-only changes (not cloud synced)”
- On premium activation:
  - prompt “Sync local changes now?”
  - one-click flush

---

## 6) Implementation Roadmap

## Phase A — Foundation (M)
Files:
- `src/lib/db.ts` (new)
- `src/lib/offline/stores.ts` (new types)
- `src/lib/offline/tempId.ts` (new)

Tasks:
- define IndexedDB schema + migrations
- transactional helpers
- temp ID allocator in `syncMeta`

## Phase B — Repository & API wrapper (L)
Files:
- `src/lib/offline/repositories/*.ts` (new)
- `src/lib/offlineAPI.ts` (new)
- replace usages in screens/hooks currently using `src/lib/api.ts`

Tasks:
- read-through cache
- offline writes + opLog append
- entity-level ACL guards

## Phase C — Assistant offline action executor (M)
Files:
- `src/lib/offlineAssistant.ts` (new)
- `src/lib/offlineEngine.ts` (extend)

Tasks:
- JSON action schema validation
- local action execution adapters for 13 supported actions
- deterministic result payload to UI

## Phase D — Sync engine (XL)
Files:
- `src/lib/syncEngine.ts` (new)
- `src/lib/offline/compaction.ts` (new)
- `src/lib/offline/conflicts.ts` (new)

Tasks:
- dependency planner
- create/update/delete/media phases
- retry/backoff/dead-letter
- reconcile refetch

## Phase E — Media pipeline (M)
Files:
- `src/lib/offline/media.ts` (new)
- moments UI capture/upload hooks

Tasks:
- Blob storage, quota checks, compression
- queue UI and retry

## Phase F — UX + Premium gating (M)
Files:
- offline banner/sync center components
- premium upsell hooks

Tasks:
- statuses: offline, pending count, failed count
- free/local-only messaging
- manual sync controls

## Phase G — QA & hardening (L)
Files:
- `tests/offline/*.spec.ts` (new)
- integration tests for temp-id remap & conflict

Tasks:
- airplane mode scenarios
- multi-tab contention
- large trip performance tests

Complexity summary:
- A: M, B: L, C: M, D: XL, E: M, F: M, G: L

---

## 7) Risk Assessment

## 7.1 Storage limits (mobile)
- Risk: IndexedDB quota eviction, especially Safari/iOS and large photo blobs.
- Mitigation:
  - `navigator.storage.estimate()` monitoring
  - `navigator.storage.persist()` request where supported
  - hard media cap (e.g., 200MB) + LRU cleanup for completed uploads
  - pre-upload compression (max dimensions + quality)

## 7.2 Data consistency
- Risk: temp-id remap bugs can orphan children; duplicate sync from multi-tab; auth-expired replay.
- Mitigation:
  - atomic remap transactions
  - global sync lock
  - idempotency key per op (`opId`)
  - clear auth failure state machine

## 7.3 Performance (100+ schedules)
- Risk: full-store scans and full refetch blocking UI.
- Mitigation:
  - indexed queries by `plan_id` + date
  - chunked sync batches
  - background reconcile
  - avoid full media decoding on list screens

## 7.4 Browser compatibility
- `navigator.locks` unavailable in some browsers -> fallback mutex required.
- Blob-in-IDB behavior differs across engines.
- WebLLM/WebGPU unsupported devices must gracefully fallback (offline AI unavailable message while CRUD still works).

## 7.5 Product/UX risks
- Free-tier local-only edits may be misunderstood as cloud-backed.
- Need explicit local-only badges and warning before logout/uninstall.

---

## Final Feasibility Verdict

**Feasible and ready to implement**, with the above schema + sync hardening.

Recommended implementation boundary for first production release:
- Full offline CRUD + sync for: `schedules`, `moments`, `travel_memos` (+ optional `comments`)
- Plan metadata update offline (selected plan only)
- Members/invite/fork/auth/geocode remain online-only
- XP/level remains server-authoritative, cached read-only offline

This gives strong traveler value while keeping ACL/security and consistency risks controlled.

---

## V3 Addendum

This addendum **overrides V2 assumptions** where conflicts exist.

### 1) Revised offline mode concept (V3)

1. Offline mode is a **user-controlled manual toggle** (`offline_mode=true/false`), not `navigator.onLine` auto mode.
2. When offline mode is ON, the app behaves as **offline-first UX mode** for travel features even if network exists.
3. Scope changes from “selected trip” to **all trips user can access**:
   - owned trips (`access_type=owner`)
   - shared trips (`access_type=shared`)
4. PWA/service worker is assumed to handle static assets (JS/CSS/images/shell). This design only covers **API/domain data caching + sync** in IndexedDB.
5. Travel features should work offline for all cached trips; only these remain blocked:
   - social/collab management: invite/member add/remove, invite links
   - plan creation
6. Premium gating is deferred: **sync pipeline is enabled for all authenticated users** in this phase.

---

### 2) Data caching trigger when toggle is turned ON

When user enables offline mode in `OfflineModelManager`, run a background bootstrap job:

**Step A — Preconditions**
- Verify login credential exists.
- Ensure IndexedDB schema ready (migrate to V3 if needed).
- Acquire bootstrap lock (singleflight) to avoid duplicate multi-tab downloads.

**Step B — Download manifest**
- Fetch all accessible plans via `GET /api/plans?mine=1` (includes owned+shared).
- For each plan id, queue data fetch jobs:
  - `GET /api/plans/:id` (plan + schedules)
  - `GET /api/plans/:id/memos`
  - `GET /api/plans/:id/members` (read-only cache)
  - comments/moments per schedule (batched with concurrency cap)

**Step C — Persist snapshot**
- Upsert each entity store transactionally.
- Mark snapshot metadata per plan:
  - `lastFetchedAt`
  - `snapshotVersion`
  - `isComplete`
- Record global status (`syncMeta.offlineBootstrapStatus = in_progress|done|failed`).

**Step D — UX feedback**
- Show progress UI: “Downloading trip data (X/Y plans)”.
- Allow app usage immediately with partial cache, but show “some trips still syncing” state.
- On completion: show “Offline data ready”.

**Step E — Keep warm while ON**
- While offline mode stays ON and user is online, run periodic lightweight refresh (e.g., every 5–10 min + on app focus).

---

### 3) Offline mode ON routing policy (key decision)

**Decision for “online + offlineMode=ON”: use SERVER-FIRST with LOCAL FALLBACK + WRITE-THROUGH CACHE.**

Reason:
- Keeps data freshest across collaborators.
- Still resilient during unstable connection.
- Preserves “offline-ready” expectation without forcing stale-local-only reads.

#### Read calls (GET)
- If `offline_mode=ON`:
  1) try server
  2) if server success -> return server data + upsert local cache
  3) if server fail/timeout -> return local cache
- If `offline_mode=OFF`: current online behavior, optional cache fill.

#### Write calls (POST/PUT/DELETE) for allowed travel features
- If `offline_mode=ON`:
  - online: send to server first; on success write-through local cache.
  - server fail/network error: enqueue opLog + apply local optimistic mutation (pending sync).
- If completely offline: local mutation + opLog queue.

#### Explicitly blocked in offline mode
- Plan create (`POST /api/plans`)
- Member/invite management endpoints
- Other social/permission-changing actions

#### AI Assistant behavior
- Keep current manual toggle semantics.
- In offline mode, assistant should execute travel data actions against local repositories/opLog, not block schedule edits.
- Remove old prompt restriction “You CANNOT modify schedules…” once local action executor is wired.

---

### 4) Pre-trip reminder mechanism (D-1)

Goal: 1 day before trip start, remind user to enable offline mode.

#### Detection logic
- On app launch, login success, and daily app focus:
  - query all cached/server plans where `start_date` in `[today+1day, today+2day)` (user timezone).
  - exclude trips already started/ended.

#### De-dup rules
- Store reminder key in local storage/IDB, e.g. `offlineReminder:<planId>:<YYYY-MM-DD>`.
- Fire once per trip per day.

#### Notification channels (web-first)
1. In-app banner/toast (default).
2. Optional Web Notification API if permission granted.

#### Reminder copy
- “Your trip to {region/title} starts tomorrow. Turn on Offline Mode now to download all trip data.”
- CTA button: “Enable Offline Mode”.

---

### 5) Revised implementation phases (V3 final)

#### Phase 1 — V3 Data Foundation
- Expand schema/repositories from single active trip to **multi-trip cache**.
- Add per-plan snapshot metadata and bootstrap status.
- Keep static resources out-of-scope (PWA handles them).

#### Phase 2 — Toggle-driven bootstrap
- Connect `offline_mode` toggle to full dataset bootstrap (all trips).
- Progress, cancel/retry handling, and multi-tab lock.

#### Phase 3 — API routing unification
- Introduce offline-aware API wrapper for all major travel endpoints.
- Implement server-first + local fallback reads.
- Implement write-through + opLog fallback writes.
- No premium checks in sync path.

#### Phase 4 — Travel feature offline parity
- Ensure schedules/moments/memos/comments + plan metadata update work offline.
- Keep plan creation and member/invite operations blocked with clear UX message.

#### Phase 5 — Continuous sync + reconcile
- Background sync for all users: online event, app focus, manual sync.
- Conflict handling + dead-letter UI.

#### Phase 6 — Pre-trip reminder
- D-1 reminder job + dedup + CTA into toggle flow.

#### Phase 7 — QA/hardening
- Multi-trip load tests, cold-start bootstrap tests, flaky-network routing tests.

---

### 6) Concrete code changes required

#### `src/lib/offlineEngine.ts`
- Keep as AI runtime manager; no major architectural change.
- Add optional helper events/hooks so UI can coordinate model-download status with data-bootstrap status (separate concerns).
- Ensure `isReady()` and init/unload are stable when toggle flips rapidly.

#### `src/components/OfflineModelManager.tsx`
- Current toggle already exists; extend it to orchestrate **two tracks**:
  1) WebLLM init/download
  2) offline data bootstrap for all trips
- Add progress states:
  - `model: idle/downloading/ready/error`
  - `data: idle/downloading/ready/error`
- On ON:
  - set `offline_mode=true`
  - kick model init + data bootstrap
- On OFF:
  - set `offline_mode=false`
  - stop background refresh workers (do not wipe cache by default)

#### `src/components/TravelAssistantChat.tsx`
- Keep `offline_mode` flag consumption.
- Replace current offline limitation prompt with action-capable offline assistant path:
  - offline mode ON + local executor available => allow schedule/memo/moment actions locally
  - continue online API usage as fallback when needed
- Update UI badge text to reflect “offline mode active” rather than “no modification possible”.

#### `src/lib/api.ts`
- Main refactor target.
- Introduce a central request strategy layer (or new `offlineAPI.ts` used by exported APIs):
  - detect `offline_mode` flag
  - for GET: server-first + local fallback
  - for write: server-first write-through; fallback to opLog+local mutation on failure
  - endpoint capability map to block non-offline-supported actions
- Add sync hooks after successful writes / connectivity restore.
- Ensure existing API signatures remain stable for component migration simplicity.

---

### Final V3 implementation stance

- **Manual toggle is the source of truth.**
- **All accessible trips are cached when enabled.**
- **Static assets are handled by PWA; API data is handled by IndexedDB + sync.**
- **Travel features must function offline; social + plan creation remain online-only.**
- **No premium gating in this implementation phase.**
- **D-1 pre-trip reminder is included in scope before coding starts.**