#!/bin/bash
# Load NVM
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

cd /mnt/c/Users/user/travel

codex --model o4-mini --full-auto "$(cat <<'PROMPT'
## Task: Implement Conflict Resolution for Offline Sync

### Context
Travly is a travel planner app with offline mode. When offline mode is ON, edits go to IndexedDB opLog and sync back when online. Problem: if user A edits offline and user B edits the same trip online, we get conflicts on sync.

### What to implement

#### 1. DB Migration: `migrations/0016_updated_at_columns.sql`
Add `updated_at` column to tables that lack it:
- `schedules`: `ALTER TABLE schedules ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;`
- `moments`: `ALTER TABLE moments ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;`

#### 2. Server API: Add conflict detection to ALL PUT endpoints
For each PUT handler, accept optional `X-Base-Updated-At` header. If provided:
1. Before updating, SELECT the current `updated_at` from DB
2. Compare: if server's `updated_at` > `X-Base-Updated-At`, return 409 with `{ conflict: true, serverVersion: <current row data> }`
3. If no conflict or header not provided, proceed normally
4. On successful update, always SET `updated_at = CURRENT_TIMESTAMP`

Files to modify:
- `functions/api/plans/[id]/index.ts` (onRequestPut) — already sets updated_at, add conflict check
- `functions/api/schedules/[id]/index.ts` (onRequestPut) — add updated_at = CURRENT_TIMESTAMP + conflict check
- `functions/api/moments/[id]/index.ts` (onRequestPut) — add updated_at = CURRENT_TIMESTAMP + conflict check  
- `functions/api/plans/[id]/memos/[memoId].ts` (onRequestPut) — already sets updated_at, add conflict check

The conflict detection pattern for each:
```typescript
const baseUpdatedAt = request.headers.get('X-Base-Updated-At');
if (baseUpdatedAt) {
  const current = await env.DB.prepare('SELECT updated_at FROM <table> WHERE id = ?').bind(id).first();
  if (current && current.updated_at && new Date(current.updated_at) > new Date(baseUpdatedAt)) {
    const serverVersion = await env.DB.prepare('SELECT * FROM <table> WHERE id = ?').bind(id).first();
    return jsonResponse({ conflict: true, serverVersion }, 409);
    // For files not using jsonResponse, use: new Response(JSON.stringify({...}), { status: 409, headers: {...} })
  }
}
```

#### 3. Client syncEngine: Handle 409 conflicts
In `src/lib/offline/syncEngine.ts`, modify `syncUpdates()`:
- When a server call returns 409:
  1. Parse the response to get `serverVersion`
  2. Store the server version in the entity's IndexedDB record with `__local.conflict = true`
  3. Also store `__local.serverVersion = serverVersion` (add this field to LocalMeta in types.ts)
  4. Mark the op as 'conflict' status (add 'conflict' to OpStatus type)
  5. Do NOT retry

In `src/lib/offline/types.ts`:
- Add `serverVersion?: Record<string, any>` to `LocalMeta`
- Add `'conflict'` to `OpStatus` union type

#### 4. Client API layer: Send X-Base-Updated-At header
In `src/lib/api.ts`, modify the update functions (plansAPI.update, schedulesAPI.update, momentsAPI.update) to accept optional `baseUpdatedAt` parameter and send it as `X-Base-Updated-At` header.

In `src/lib/offline/syncEngine.ts` syncUpdates, pass `op.baseUpdatedAt` when calling the API.

#### 5. Conflict Resolution UI Component
Create `src/components/ConflictResolver.tsx`:
- Shows when there are ops with status='conflict' 
- Displays side-by-side comparison: "My version" vs "Server version"
- Three buttons: "Keep Mine" (force push), "Keep Server" (discard local), "Merge" (future, disabled for now)
- "Keep Mine": re-queue the op WITHOUT baseUpdatedAt (force overwrite), remove conflict flag
- "Keep Server": delete the op, update local cache with server version, clear conflict flag

Create `src/components/ConflictBanner.tsx`:
- Small banner/toast that appears when conflicts exist
- "N개 충돌 발생 — 해결하기" with link/button to open ConflictResolver
- Use orange/yellow warning color
- Show in PlanDetailPage when viewing a plan with conflicts

#### 6. Wire up ConflictBanner
In `src/pages/PlanDetailPage.tsx`:
- Import and render ConflictBanner at the top of the page
- It should check for conflict ops related to the current plan

### Important rules
- Do NOT modify any files not mentioned above
- Do NOT add external dependencies  
- Use existing patterns (jsonResponse, errorResponse, etc.)
- Korean UI text for user-facing strings
- Commit when done with message "feat: conflict resolution for offline sync (409 detection + resolver UI)"
- Run `npm run build` to verify no build errors before committing
PROMPT
)"
