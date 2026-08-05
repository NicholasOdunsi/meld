# Hardening Report — PRD generation idempotency & failure recovery

## Status

DONE (commit `5de366f`). Out-of-band relative to the plan's Task 10 scope;
human approved keeping it (option A) during the resumed session.

## Why

After Task 9 the confirm→generate path existed but three gaps remained:

1. Nothing stopped a room from queuing multiple concurrent `prd_generate`
   tasks (multi-tab, double-click, retry).
2. A `failed` / `needs_review` / auth / usage-limit generation had no
   user-facing recovery — the PRD tab fell back to the empty state.
3. The Generate PRD confirm chip could flash before the first room-task
   status read resolved, and the completion→materialization window could
   momentarily show "no PRD".

## Changes

### DB — `202608020007_prd_generate_idempotency.sql`
- Partial unique index `ai_tasks_one_active_prd_generate_per_room` on
  `(room_id) where kind = 'prd_generate' and status in (queued,
  waiting_for_device, ready_to_run, running)`. Terminal tasks stay as
  history and never block an explicit recovery.
- `create_prd_generate_task` takes `pg_advisory_xact_lock(hashtextextended(
  room_id))` then returns the existing active task (same JSON shape) instead
  of inserting a duplicate. The partial index is the final invariant behind
  the lock. Grants/revokes unchanged.

### UI — failure recovery
- `AgentTaskState` gains `taskKind` and a `PRD_ATTENTION_PRESENTATION` map:
  `retry` action ("Try again") for `failed` / `needs_review`,
  `fix_connection` for `needs_reauthentication` / `usage_limit_reached`.
- `PrdTabContent` renders the recovery banner for those statuses and
  re-queues via `generatePrd`, guarded by a synchronous `retryInFlight` ref;
  fix-connection routes to device settings with a `returnTo` back to the PRD
  tab.

### Race fixes — `RoomTaskStatusProvider`
- New context: `hasCompletedInitialRead`, `latestPrdTask`,
  `hasPrdTaskSurface`.
- Completion→materialization guard (`awaitingMaterializationTaskIds`) keeps
  the generating surface until the PRD row is visible; refresh only fires for
  `completed` PRD tasks.
- The Generate PRD chip is gated on
  `hasCompletedInitialRead && !hasPrdTaskSurface`, so it no longer flickers
  before the first read.
- Tab strip / chip / provider all key off `hasPrdTaskSurface` (generation OR
  recoverable failure) instead of `hasPrdGeneration` alone.
- Copy: "Runs on your Codex" → "Uses your Codex subscription".

## Tests updated
- `create_prd_generate_task.test.sql`: 17 → 20 — repeated request returns the
  active task; only one active generation per room; queued rows settled
  between assertions that need a fresh insert.
- `ai_task_transitions.test.sql`: settles its first queued `prd_generate`
  fixture before creating a second, so the new unique index does not reject
  the shared-room case.
- `agent-task-state.test.tsx`, `conversation.test.tsx`,
  `room-task-status-provider.test.tsx`: recovery banner, retry guard, chip
  gating, and surface transitions.

## Verification (Node 20.19.0)
- `create_prd_generate_task.test.sql` — 20/20.
- `ai_task_transitions.test.sql` — 240/240.
- Affected web vitest suites — 48/48.
- `pnpm typecheck` — 5/5.
- Migration `202608020007` applied and listed locally.

## Follow-up
- Flag for the final whole-branch review alongside the controller UI
  refinements.
- Task 10 (E2E ask → confirm → generate → view) still pending.
