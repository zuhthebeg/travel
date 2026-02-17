# Codex Task: Offline V3 Unit Tests

## Context
V3 offline mode has been implemented. Test files needed for verification.

## Files to test
1. `src/lib/offline/tempId.ts` — genTempId, isTempId, resetTempId
2. `src/lib/db.ts` — IndexedDB schema, CRUD helpers, opLog helpers
3. `src/lib/offline/bootstrap.ts` — runBootstrap, keep-warm
4. `src/lib/offline/syncEngine.ts` — compaction, sync phases
5. `src/lib/offlineAPI.ts` — routing logic (server-first + fallback)
6. `src/hooks/usePreTripReminder.tsx` — D-1 detection logic

## Test requirements
- Use vitest + fake-indexeddb for IndexedDB mocking
- Test files go in `tests/offline/*.test.ts`
- Key scenarios:
  - tempId generates negative, decrementing IDs
  - isTempId correctly identifies negative numbers
  - opLog CRUD (add, getPending, updateStatus, countByStatus)
  - Op compaction rules (create+delete=drop, merge updates, create+update=merge)
  - serverFirstRead: server success → cache; server fail → local fallback
  - serverFirstWrite: server success → write-through; server fail → opLog
  - Bootstrap downloads all plans and caches them
  - Sync creates parent-first, deletes child-first
  - Pre-trip reminder fires for D-1 trips, dedup works
  - Blocked operations throw proper errors offline

## Install if needed
```
npm i -D fake-indexeddb
```
