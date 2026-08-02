# Task 9 Report — PRD generation action, confirmation, and in-tab progress

## Status

DONE

Task 9 is implemented, locally migrated, verified on Node 20.19.0, self-reviewed,
and committed. A Product Agent proposal now exposes an explicit, deduplicated
Generate PRD confirmation; the PRD tab appears as soon as the task queues; the
room-level task poll survives tab-content changes; and terminal PRD task status
refreshes the route so the materialized document replaces the generating view.

## Architecture and behavior

- `generatePrd` strictly validates the room UUID and optional provider, selects
  the in-memory fake only through the existing E2E gate, keeps the production RPC
  wrapper behind `server-only`, returns only queued status plus task ID, and maps
  internal failures to stable user-facing copy.
- The confirm control renders only for canonical
  `proposedAction.kind === "prd_generate"` messages while no PRD or generation is
  active. It includes the exact `Generate PRD`,
  `Uses your Codex subscription · ~30–60s`, and `Not yet` copy. A synchronous ref blocks
  overlapping clicks globally across every proposal message; the button shows a
  loading state, errors remain retryable, and dismissal is local to the proposal.
- `RoomTaskStatusProvider` is mounted above the room tabs and tab content. It owns
  the existing `RoomTaskStatusPoller`, exposes safe statuses and optimistic queue
  notices through context, and remains mounted while Conversation or PRD content
  swaps beneath it.
- The provider makes the PRD tab visible immediately from the queued task notice,
  continues polling in the PRD tab, and refreshes once when an observed active or
  optimistic `prd_generate` task becomes terminal. Historical terminal tasks do
  not cause refresh loops.
- `parseRoomTab` now permits `?tab=prd` before a PRD row exists. During the first
  task-status read or an active/optimistic PRD task, `PrdTabContent` renders a
  pulsing status, progress rail, and token-sized Astryx skeleton cards. It falls
  back to the existing empty state when no task exists and renders the unchanged
  `PrdDocument` once the server sees the row, preserving all approved document
  and minimap refinements.
- The poller now preserves a queue notice received during an in-flight read and
  wakes immediately when notified during a scheduled interval. This closes two
  races that could otherwise leave a newly queued PRD invisible.

## Database migration

`202608020006_room_task_status_kind.sql` recreates the latest
`public.list_room_ai_task_statuses(uuid)` body with one safe addition:
`kind public.ai_task_kind` in the return table and `task.kind` in the projection.
The participant authorization check, `security definer`, empty `search_path`,
ordering, revokes, and authenticated grant are unchanged.

The brief requested `create or replace`, but PostgreSQL rejects changing a
`RETURNS TABLE` output row shape through `create or replace` (`OUT` parameters
define a different row type). The migration therefore drops and recreates only
that exact function signature, then reapplies the unchanged grants. It applied
successfully to the local database and is registered as `202608020006`.

## Files changed

- `apps/web/src/features/prd/actions.ts` and `actions.test.ts` — validated server
  action, production/fake routing, stable errors, and result minimization tests.
- `apps/web/src/features/prd/create-prd-generate-task.ts` and its test —
  authenticated `create_prd_generate_task` RPC wrapper and error redaction.
- `apps/web/src/features/prd/e2e-fake.ts` — E2E-gated Task 9 queue boundary;
  Task 10 remains responsible for fake connector advancement and PRD insertion.
- `apps/web/src/features/prd/components/room-task-status-provider.tsx` and its
  test — room-level polling, optimistic tab visibility, generating state signal,
  and terminal refresh.
- `apps/web/src/features/prd/components/prd-generating.tsx` — in-document
  generating and no-task content.
- `apps/web/src/features/prd/components/room-tab-strip.tsx`, `room-tabs.ts`, and
  tab tests — progressive visibility and unclamped PRD query parsing.
- `apps/web/src/features/discovery/components/conversation.tsx` and its test —
  confirm/dismiss controls, loading, global rapid-submit prevention, errors,
  navigation, and shared-status consumption.
- `apps/web/src/features/ai/room-task-status.ts` and its test — safe `kind`
  mapping and queue-notification race fixes.
- `apps/web/src/app/(app)/[organizationId]/discovery/[roomId]/page.tsx` and its
  test — room-level provider boundary and PRD tab-content wiring.
- `apps/web/src/features/discovery/e2e-fake.ts` — existing room-reply fake status
  now projects `kind: "room_reply"`.
- `supabase/migrations/202608020006_room_task_status_kind.sql` and
  `supabase/tests/room_agent_messages.test.sql` — safe SQL projection and pgTAP
  kind assertion.

## Astryx discovery and conformance

- Ran `pnpm exec astryx build "PRD generation confirmation and in-document generating state"`.
- Inspected the named `editor --skeleton` template.
- Inspected component APIs for Button, HStack, Text, VStack, StatusDot, Card,
  Divider, EmptyState, and Skeleton before adding UI.
- Astryx CLI 0.1.8 itself requires Node >=22.13, so only discovery commands used
  the installed Node 24 runtime. All application tests, checks, and builds used
  the required Node 20.19.0.
- New UI uses leaf imports, real component props, Astryx layout components, and
  design tokens. It adds no raw `div`/`span`, pixel/hex values, CSS files, or
  utility classes.

## TDD evidence

Initial focused RED command:

~~~text
pnpm --filter web exec vitest run \
  src/features/prd/actions.test.ts \
  src/features/prd/create-prd-generate-task.test.ts \
  src/features/prd/components/room-task-status-provider.test.tsx \
  src/features/prd/components/room-tab-strip.test.tsx \
  src/features/ai/room-task-status.test.ts \
  src/features/discovery/components/conversation.test.tsx
Exit 1
~~~

Expected RED signals were missing action/RPC/provider/generating modules, absent
`kind` mapping, `parseRoomTab` still clamping to Conversation, and no Generate PRD
control. Separate RED regressions reproduced a queue notification lost during an
in-flight read, a delayed wake-up during the scheduled interval, permissive extra
action fields, and overlapping submissions from separate proposal messages.

Final focused command:

~~~text
pnpm --filter web exec vitest run \
  src/features/prd/actions.test.ts \
  src/features/prd/create-prd-generate-task.test.ts \
  src/features/prd/components/room-task-status-provider.test.tsx \
  src/features/prd/components/room-tab-strip.test.tsx \
  src/features/ai/room-task-status.test.ts \
  src/features/discovery/components/conversation.test.tsx \
  'src/app/(app)/[organizationId]/discovery/[roomId]/page.test.tsx'
Exit 0 — 7 files, 54 tests
~~~

## Verification

All commands below ran with `nvm use 20.19.0` unless noted:

- `pnpm --filter web test` — PASS, 74 files / 508 tests.
- `pnpm typecheck` — PASS, 5/5 workspace packages.
- `pnpm lint` — PASS, 5/5 workspace packages plus root ESLint.
- `pnpm check:astryx apps/web/src` — PASS.
- `pnpm --filter web build` — PASS; production route compilation includes
  `/[organizationId]/discovery/[roomId]`.
- `pnpm test:sql` — PASS (contract parity, function arities, SQL grammar/static
  checks).
- `pnpm exec supabase migration up --local` — PASS; applied
  `202608020006_room_task_status_kind.sql`.
- `pnpm exec supabase migration list --local` — local and database both report
  `202608020006`.
- `pnpm exec supabase test db --local supabase/tests/room_agent_messages.test.sql supabase/tests/create_prd_generate_task.test.sql`
  — PASS, 2 files / 67 assertions.
- `git diff --check` and the raw-layout/hardcoded-value scan — PASS.

The all-file local pgTAP command was also attempted. Task 9 suites passed, but the
populated development database caused unrelated existing tests to fail: an
invitation fixture ID already existed, and `prds.test.sql` found pre-existing PRD
rows. Resetting or truncating the user's local database would be destructive, so
it was not performed. The affected focused suites passed against that same
database after the migration.

## Commit

- `6f442e6` — `feat(prd): generate from room conversation`

The report commit follows.

## Concerns

No blocking implementation concerns. The full all-file pgTAP baseline requires a
clean or explicitly truncated disposable database; the current local database is
intentionally preserved. Task 10 still owns end-to-end fake task advancement and
fake PRD materialization, as specified by the approved plan.

## Fix round 1 — duplicate guards and asynchronous recovery

Status: DONE

The review follow-up closes both remaining duplicate windows and surfaces every
recoverable terminal PRD task state in the PRD tab.

- Conversation does not expose an actionable Generate control until the first
  participant-scoped task-status read succeeds. Active, optimistic,
  completed-awaiting-materialization, and recoverable PRD states all suppress
  proposal controls.
- A completed task observed while active is retained as
  completed-awaiting-materialization. The PRD tab and drafting surface remain
  visible while the route refreshes, and the latch ceases to participate only
  once refreshed server props report `hasPrd`. Historical completed tasks do
  not refresh; repeated completed emissions refresh at most once.
- `AgentTaskState` now accepts a PRD-specific presentation mode. Authentication
  and usage-limit blockers route to connection setup with a PRD-tab return path;
  failed and needs-review states expose `Try again`, preserving the task's
  provider when queuing a fresh generation.
- `202608020007_prd_generate_idempotency.sql` serializes same-room generation
  requests with a transaction-scoped advisory lock, returns an existing active
  generation from the RPC, and adds a partial unique index enforcing one active
  `prd_generate` task per room across every write path.
- The generic task-transition pgTAP fixture now settles its first valid PRD
  creation before creating a second one, preserving its original coverage while
  respecting the new database invariant.

### Fix-round TDD and verification

- Focused RED: 3 files, 6 expected failures / 41 passing assertions.
- Focused GREEN: 3 files, 48 passing assertions.
- `pnpm --filter web test --run`: PASS, 74 files / 517 tests.
- `pnpm test:workspace`: PASS, 114 files / 1,068 tests across all five packages.
- `pnpm typecheck`: PASS, 5/5 packages.
- `pnpm build`: PASS, 3/3 build packages.
- `pnpm --filter web exec eslint src`: PASS with zero errors and two pre-existing
  warnings in `room-tabs.ts` and `e2e-fake.ts`.
- `pnpm check:astryx`: PASS. Astryx discovery additionally inspected the named
  `incident-console --skeleton` template plus Banner and Button APIs.
- `pnpm test:sql`: PASS.
- `pnpm exec supabase migration up --local`: PASS; migration 007 applied without
  resetting or truncating the existing local database.
- Focused pgTAP: PASS, `ai_task_transitions.test.sql` 240/240 and
  `create_prd_generate_task.test.sql` 20/20.
- Full pgTAP: all Task 9 and transition suites pass; 9/11 files pass. The same
  preserved local-data pollution still breaks only `invitations.test.sql`
  (pre-existing fixture ID) and `prds.test.sql` (pre-existing PRD rows).
- `git diff --check`: PASS.

The root `pnpm lint` command was attempted but scans generated
`apps/web/.next-e2e` output and reports generated-code errors. Source-scoped
ESLint is clean; the generated directory was preserved because other work in
this shared workspace may own it.

Fix-round implementation commit: `5de366f` —
`feat(prd): idempotent generation with failure recovery`.
