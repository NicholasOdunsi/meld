# Orion Overview and Working Hats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Home with an Overview page and show each project's and tab's
live AI state with the Orion hat mascot (swaying = working, curious + hopping =
needs you) in the web sidebar and tabs and in the native Mac frame.

**Architecture:** One database function (`list_workspace_activity`) classifies
every room the user can see as idle / working / needs-you (asked, finished,
stuck). A web provider polls it and shares the result with the sidebar, tabs,
Overview and the native-frame bridge. The hat is a tinted, animated variant of
the existing `OrionTalkingHat` SVG on the web. On the Mac it is a SwiftUI view
over PNG frames exported from that same SVG.

**Tech Stack:** Supabase Postgres + pgTAP, Next.js 15 / React 19 server
actions, Astryx UI, Vitest + Testing Library, zod (`@meld/contracts`),
Swift 6 / SwiftUI (macOS 26), Playwright (for asset export only).

**Spec:** `docs/superpowers/specs/2026-11-09-orion-overview-and-working-hats-design.md`

## Global Constraints

- Web UI follows `AGENTS.md` (Astryx): no raw `<div>`/`<span>` layout, no raw hex/px. Use tokens (`var(--spacing-*)`, `var(--color-*)`) and Astryx components. Keyframe animation goes in a CSS module, following the precedent in `apps/web/src/ui/wave-text.module.css`.
- Project colours come from `PROJECT_COLOR_VARS` (`apps/web/src/features/projects/project-icons.tsx`) on the web and `ProjectStyle.color(_:)` on the Mac.
- Motion values (copy exactly):
  - Working sway: `skewX(5deg)` ↔ `skewX(-6deg)`, origin `50% 95%`, 2.8s ease-in-out, infinite. Gaze translates x −5 → +6 (SVG units) in sync.
  - Needs-you hop: 6s loop. Keyframes at 0% `translateY(0) scale(1,1)`, 2% `scale(1.12,.86)`, 5% `translateY(-38%) scale(.94,1.08)`, 8% `scale(1.1,.9)`, 10–100% rest. Origin `50% 100%`.
  - Blink: `scaleY(.08)` at 95% of a 5s loop.
  - Hop applies **only** in the sidebar, never on tabs or Overview rows.
  - `prefers-reduced-motion: reduce` (web) / `accessibilityReduceMotion` (Mac) disables sway, hop, blink and transitions. The hats themselves still show.
- Polling: every 5000 ms while `document.visibilityState === "visible"`, otherwise every 30000 ms.
- Wording is defined once, in `apps/web/src/features/activity/describe.ts` (Task 3). No other file may hard-code needs-you titles.
- The sidebar label "Home" becomes **"Overview"** on both web and Mac. The route stays `/${workspaceId}`.
- Swift work follows `.claude/skills/swiftui-pro`.
- Commit after every task. Messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Commands

| What | Command (repo root unless noted) |
|---|---|
| One web test file | `pnpm --filter web exec vitest run <path relative to apps/web>` |
| Contracts tests | `pnpm --filter @meld/contracts exec vitest run` |
| Web typecheck | `pnpm --filter web typecheck` |
| Astryx conventions | `pnpm check:astryx` |
| DB tests (local Supabase must be running; see memory note `meld-local-setup`) | `pnpm test:db` |
| SQL lint suite | `pnpm test:sql` |
| Swift tests | `cd apps/mac && swift test` / `cd packages/orion-design-system && swift test` |

If `pnpm --filter web` doesn't match, check the `name` in `apps/web/package.json` and use that name.

## File map

| File | Responsibility | Task |
|---|---|---|
| `supabase/migrations/20261109000001_workspace_activity.sql` | `room_views` table, `mark_room_viewed`, `dismiss_room_attention`, `list_workspace_activity` | 1 |
| `supabase/tests/workspace_activity.test.sql` | pgTAP for the above | 1 |
| `packages/contracts/src/activity.ts` (+ test, + index export) | `RoomActivity` zod schema/types | 2 |
| `apps/web/src/features/activity/activity-reader.ts` (+ test) | RPC row → `RoomActivity` | 2 |
| `apps/web/src/features/activity/actions.ts` (+ test) | Server actions: get activity, mark viewed, dismiss | 2 |
| `apps/web/src/features/activity/rollup.ts` (+ test) | Rooms → per-project state | 3 |
| `apps/web/src/features/activity/describe.ts` (+ test) | All user-facing wording | 3 |
| `apps/web/src/features/activity/workspace-activity-provider.tsx` (+ test) | Polling provider + `useWorkspaceActivity()` | 4 |
| `apps/web/src/ui/orion-talking-hat.tsx` (modify) | `tint` prop + `data-part="look"` gaze groups | 5 |
| `apps/web/src/ui/orion-hat-mark.tsx` + `.module.css` (+ test) | Animated, tinted status hat | 5 |
| `apps/web/src/features/activity/components/project-status-mark.tsx` (+ test) | Glyph-or-hat + tooltip for a project/tab | 6 |
| `apps/web/src/ui/orion-sidebar.tsx`, `features/projects/components/project-tabs.tsx`, `app/(app)/[workspaceId]/layout.tsx` (modify) | Wire hats + provider; rename Home → Overview | 6 |
| `apps/web/src/features/activity/components/mark-room-viewed.tsx` (+ test), room page (modify) | Clear "finished" on open | 7 |
| `apps/web/src/features/activity/components/needs-you-list.tsx`, `all-projects-list.tsx` (+ tests), `app/(app)/[workspaceId]/page.tsx` (modify) | Overview page | 8 |
| `apps/web/src/features/native/bridge.ts`, `native-frame-bridge.tsx` (modify); `apps/mac/Sources/OrionAppCore/Frame/FrameActivity.swift`, `FrameSnapshot.swift` (modify) | Activity in the native snapshot | 9 |
| `scripts/mascot/export-hat-frames.mjs`; `packages/orion-design-system/Sources/OrionDesignSystem/Resources/Mascot/*.png` | Export hat PNG frames for the Mac | 10 |
| `packages/orion-design-system/Sources/OrionDesignSystem/Components/OrionHatMark.swift` (+ test) | SwiftUI hat | 10 |
| `apps/mac/Sources/Orion/Frame/FrameSidebar.swift`, `ProjectTabBar.swift` (modify) | Native wiring + Overview label | 11 |

Tasks 1 and 5 can run in parallel. After Task 4, Tasks 6, 7, 8 and 9 can run in parallel. Task 10 needs only Task 5. Task 11 needs Tasks 9 and 10.

---

### Task 1: Database: room views and workspace activity

**Files:**
- Create: `supabase/migrations/20261109000001_workspace_activity.sql`
- Test: `supabase/tests/workspace_activity.test.sql`

**Interfaces:**
- Produces:
  - `public.mark_room_viewed(target_room_id uuid) returns void`
  - `public.dismiss_room_attention(target_room_id uuid) returns void`
  - `public.list_workspace_activity(target_workspace_id uuid)` returning rows of
    `(room_id uuid, project_id uuid, room_name text, state text, reason text, task_kind ai_task_kind, task_status ai_task_status, provider ai_provider, proposal_kind text, proposal_message_id uuid, occurred_at timestamptz, last_activity_at timestamptz)`
  - Existing, reused for dismissing "asked" items: `public.dismiss_message_proposal(target_message_id uuid)`.

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/workspace_activity.test.sql`. Every fixture uses explicit timestamps, because `now()` is fixed for the whole test transaction.

```sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(21);

select has_function('public'::name, 'list_workspace_activity'::name, array['uuid']::name[], 'activity reader exists');
select has_function('public'::name, 'mark_room_viewed'::name, array['uuid']::name[], 'mark viewed exists');
select has_function('public'::name, 'dismiss_room_attention'::name, array['uuid']::name[], 'dismiss exists');
select ok(
  not has_function_privilege('anon', 'public.list_workspace_activity(uuid)', 'EXECUTE'),
  'anonymous users cannot read activity'
);
select ok(
  not has_table_privilege('authenticated', 'public.room_views', 'SELECT'),
  'room_views is only reachable through the functions'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('a1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'activity-owner@example.com', '', now(), '{}', '{}', now(), now()),
  ('a1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'activity-outsider@example.com', '', now(), '{}', '{}', now(), now());

insert into public.workspaces (id, name, created_by)
values ('a2000000-0000-4000-8000-000000000001', 'Activity workspace',
        'a1000000-0000-4000-8000-000000000001');

insert into public.projects (id, workspace_id, name, created_by)
values ('a7000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001',
        'Activity project', 'a1000000-0000-4000-8000-000000000001');

-- R1 working, R2 stuck, R3 finished-unseen, R4 finished-seen, R5 asked,
-- R6 idle, R7 stuck-dismissed, R8 asked-answered.
insert into public.rooms (id, workspace_id, project_id, name, owner_id)
select ('a4000000-0000-4000-8000-00000000000' || n)::uuid,
       'a2000000-0000-4000-8000-000000000001',
       'a7000000-0000-4000-8000-000000000001',
       'Room ' || n,
       'a1000000-0000-4000-8000-000000000001'
from generate_series(1, 8) as n;

insert into public.execution_devices (id, user_id, name, platform, token_hash, status)
values ('a3000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
        'Activity Mac', 'macos', repeat('b', 64), 'active');

-- (task suffix, room suffix, status, hours ago)
insert into public.ai_tasks (
  id, initiating_user_id, workspace_id, room_id, device_id,
  provider, kind, status, instruction, context_manifest_json, agent_kind,
  created_at, updated_at
)
select ('a5000000-0000-4000-8000-0000000000' || lpad(t.task, 2, '0'))::uuid,
       'a1000000-0000-4000-8000-000000000001',
       'a2000000-0000-4000-8000-000000000001',
       ('a4000000-0000-4000-8000-00000000000' || t.room)::uuid,
       'a3000000-0000-4000-8000-000000000001',
       'claude', 'room_reply', t.status::public.ai_task_status,
       'Activity fixture ' || t.task,
       '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb,
       'product',
       now() - make_interval(hours => t.hours),
       now() - make_interval(hours => t.hours)
from (values
  ('1', '1', 'failed',    5),
  ('2', '1', 'running',   1),
  ('3', '2', 'failed',    1),
  ('4', '3', 'completed', 1),
  ('5', '4', 'completed', 2),
  ('6', '5', 'completed', 3),
  ('7', '7', 'failed',    2),
  ('8', '8', 'completed', 3)
) as t(task, room, status, hours);

-- Agent replies carrying proposals in R5 (unanswered) and R8 (answered).
insert into public.messages (
  id, room_id, client_id, author_type, author_id, initiated_by,
  ai_task_id, provider, body, proposed_action, created_at
)
values
  ('a6000000-0000-4000-8000-000000000005', 'a4000000-0000-4000-8000-000000000005',
   'a6100000-0000-4000-8000-000000000005', 'product_agent', null,
   'a1000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000006',
   'claude', 'Shall I map the user flow?', '{"kind":"user_flow_generate"}'::jsonb,
   now() - interval '3 hours'),
  ('a6000000-0000-4000-8000-000000000008', 'a4000000-0000-4000-8000-000000000008',
   'a6100000-0000-4000-8000-000000000008', 'product_agent', null,
   'a1000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000008',
   'claude', 'Shall I map the user flow?', '{"kind":"user_flow_generate"}'::jsonb,
   now() - interval '3 hours');

insert into public.message_proposal_responses (message_id, user_id, response)
values ('a6000000-0000-4000-8000-000000000008', 'a1000000-0000-4000-8000-000000000001', 'dismissed');

insert into public.room_views (user_id, room_id, last_viewed_at, dismissed_at)
values
  ('a1000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000004', now() - interval '1 hour', null),
  ('a1000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000005', now() - interval '1 hour', null),
  ('a1000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000006', now() - interval '1 hour', null),
  ('a1000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000007', null, now() - interval '1 hour'),
  ('a1000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000008', now() - interval '1 hour', null);

-- Created before switching role; the function still reads the caller from
-- the JWT claim when the view is queried.
create temporary view activity as
select room_id, state || '/' || coalesce(reason, '') as verdict, proposal_kind, proposal_message_id
from public.list_workspace_activity('a2000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);

select is((select verdict from activity where room_id = 'a4000000-0000-4000-8000-000000000001'), 'working/', 'a running task wins over an older failure');
select is((select verdict from activity where room_id = 'a4000000-0000-4000-8000-000000000002'), 'needs_you/stuck', 'a failed latest task is stuck');
select is((select verdict from activity where room_id = 'a4000000-0000-4000-8000-000000000003'), 'needs_you/finished', 'unseen completed work is finished');
select is((select verdict from activity where room_id = 'a4000000-0000-4000-8000-000000000004'), 'idle/', 'completed work seen afterwards is idle');
select is((select verdict from activity where room_id = 'a4000000-0000-4000-8000-000000000005'), 'needs_you/asked', 'an unanswered offered proposal is asked');
select is((select proposal_kind from activity where room_id = 'a4000000-0000-4000-8000-000000000005'), 'user_flow_generate', 'asked rows carry the proposal kind');
select is((select verdict from activity where room_id = 'a4000000-0000-4000-8000-000000000006'), 'idle/', 'a room with no work is idle');
select is((select verdict from activity where room_id = 'a4000000-0000-4000-8000-000000000007'), 'idle/', 'a dismissed failure is idle');
select is((select verdict from activity where room_id = 'a4000000-0000-4000-8000-000000000008'), 'idle/', 'an answered proposal is not asked');

select lives_ok($$ select public.mark_room_viewed('a4000000-0000-4000-8000-000000000003') $$, 'owner can mark a room viewed');
-- now() is the transaction start, which is after the task's updated_at.
select is((select verdict from activity where room_id = 'a4000000-0000-4000-8000-000000000003'), 'idle/', 'viewing clears finished');

select lives_ok($$ select public.dismiss_room_attention('a4000000-0000-4000-8000-000000000002') $$, 'owner can dismiss a stuck room');
select is((select verdict from activity where room_id = 'a4000000-0000-4000-8000-000000000002'), 'idle/', 'dismissing clears stuck');

select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
select is((select count(*)::int from public.list_workspace_activity('a2000000-0000-4000-8000-000000000001')), 0, 'outsiders see no rooms');
select throws_ok($$ select public.mark_room_viewed('a4000000-0000-4000-8000-000000000003') $$, '42501', null, 'outsiders cannot mark rooms viewed');

reset role;
-- R6 has a view row but no tasks or messages, so nothing else blocks the delete.
delete from public.rooms where id = 'a4000000-0000-4000-8000-000000000006';
select is((select count(*)::int from public.room_views where room_id = 'a4000000-0000-4000-8000-000000000006'), 0, 'deleting a room deletes its views');

select * from finish();
rollback;
```

The prd_generate/prd_revise "offered" branches aren't fixture-tested here. `prds` rows need legacy organization fixtures. They are covered by the code-review check in Step 3 against `isProposalOffered`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:db`
Expected: `workspace_activity.test.sql` FAILS on `has_function` / missing `room_views`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261109000001_workspace_activity.sql`:

```sql
-- Orion Overview + working hats
-- (docs/superpowers/specs/2026-11-09-orion-overview-and-working-hats-design.md).
-- Classifies every Room the caller participates in as idle, working, or
-- needing them (asked / finished / stuck).

create table public.room_views (
  user_id uuid not null references auth.users(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  last_viewed_at timestamptz,
  dismissed_at timestamptz,
  primary key (user_id, room_id)
);

alter table public.room_views enable row level security;
-- No policies on purpose: read and written only through the functions below.
revoke all on table public.room_views from anon, authenticated;

create function public.mark_room_viewed(target_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_room_participant(target_room_id) then
    raise exception 'Room not found.' using errcode = '42501';
  end if;
  insert into public.room_views (user_id, room_id, last_viewed_at)
  values (auth.uid(), target_room_id, now())
  on conflict (user_id, room_id)
    do update set last_viewed_at = excluded.last_viewed_at;
end;
$$;

create function public.dismiss_room_attention(target_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_room_participant(target_room_id) then
    raise exception 'Room not found.' using errcode = '42501';
  end if;
  insert into public.room_views (user_id, room_id, dismissed_at)
  values (auth.uid(), target_room_id, now())
  on conflict (user_id, room_id)
    do update set dismissed_at = excluded.dismissed_at;
end;
$$;

create function public.list_workspace_activity(target_workspace_id uuid)
returns table (
  room_id uuid,
  project_id uuid,
  room_name text,
  state text,
  reason text,
  task_kind public.ai_task_kind,
  task_status public.ai_task_status,
  provider public.ai_provider,
  proposal_kind text,
  proposal_message_id uuid,
  occurred_at timestamptz,
  last_activity_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  with visible_room as (
    select room.id, room.project_id, room.name
    from public.rooms as room
    where room.workspace_id = target_workspace_id
      and public.is_room_participant(room.id)
  ),
  room_view as (
    select view.room_id, view.last_viewed_at, view.dismissed_at
    from public.room_views as view
    where view.user_id = auth.uid()
  ),
  active_room as (
    select distinct task.room_id
    from public.ai_tasks as task
    join visible_room on visible_room.id = task.room_id
    where task.status in ('queued', 'waiting_for_device', 'ready_to_run', 'running')
  ),
  latest_task as (
    select distinct on (task.room_id)
      task.room_id, task.kind, task.status, task.provider, task.updated_at
    from public.ai_tasks as task
    join visible_room on visible_room.id = task.room_id
    order by task.room_id, task.updated_at desc, task.id desc
  ),
  latest_proposal as (
    select distinct on (message.room_id)
      message.room_id, message.id, message.ai_task_id,
      message.proposed_action ->> 'kind' as kind, message.created_at
    from public.messages as message
    join visible_room on visible_room.id = message.room_id
    where message.proposed_action is not null
    order by message.room_id, message.created_at desc, message.id desc
  ),
  -- Mirrors isProposalOffered in
  -- apps/web/src/features/rooms/components/conversation.tsx. Change both
  -- together. "PRD task settled" is implied: a running task makes the
  -- room 'working' before this is consulted.
  open_proposal as (
    select proposal.*
    from latest_proposal as proposal
    where not exists (
        select 1 from public.message_proposal_responses as response
        where response.message_id = proposal.id
          and response.user_id = auth.uid()
      )
      and case proposal.kind
        when 'prd_generate' then not exists (
          select 1 from public.prds as prd where prd.room_id = proposal.room_id)
        when 'prd_revise' then proposal.ai_task_id is not null and exists (
          select 1 from public.prds as prd where prd.room_id = proposal.room_id)
        else true
      end
  ),
  latest_message as (
    select message.room_id, max(message.created_at) as at
    from public.messages as message
    join visible_room on visible_room.id = message.room_id
    group by message.room_id
  ),
  classified as (
    select
      visible_room.id as room_id,
      visible_room.project_id,
      visible_room.name as room_name,
      active_room.room_id is not null as is_working,
      coalesce(
        latest_task.status in ('failed', 'needs_reauthentication', 'usage_limit_reached', 'needs_review')
          and latest_task.updated_at > coalesce(room_view.dismissed_at, '-infinity'::timestamptz),
        false) as is_stuck,
      open_proposal.id is not null as is_asked,
      coalesce(
        latest_task.status = 'completed'
          and latest_task.updated_at > coalesce(room_view.last_viewed_at, '-infinity'::timestamptz),
        false) as is_finished,
      latest_task.kind as task_kind,
      latest_task.status as task_status,
      latest_task.provider,
      latest_task.updated_at as task_at,
      open_proposal.kind as proposal_kind,
      open_proposal.id as proposal_message_id,
      open_proposal.created_at as proposal_at,
      greatest(latest_task.updated_at, latest_message.at) as last_activity_at
    from visible_room
    left join active_room on active_room.room_id = visible_room.id
    left join latest_task on latest_task.room_id = visible_room.id
    left join room_view on room_view.room_id = visible_room.id
    left join open_proposal on open_proposal.room_id = visible_room.id
    left join latest_message on latest_message.room_id = visible_room.id
  )
  select
    c.room_id,
    c.project_id,
    c.room_name,
    case
      when c.is_working then 'working'
      when c.is_stuck or c.is_asked or c.is_finished then 'needs_you'
      else 'idle'
    end,
    case
      when c.is_working then null
      when c.is_stuck then 'stuck'
      when c.is_asked then 'asked'
      when c.is_finished then 'finished'
    end,
    c.task_kind,
    c.task_status,
    c.provider,
    case when not c.is_working and not c.is_stuck and c.is_asked then c.proposal_kind end,
    case when not c.is_working and not c.is_stuck and c.is_asked then c.proposal_message_id end,
    case
      when c.is_working then null
      when c.is_stuck then c.task_at
      when c.is_asked then c.proposal_at
      when c.is_finished then c.task_at
    end,
    c.last_activity_at
  from classified as c
  order by c.room_id;
end;
$$;

revoke all on function public.mark_room_viewed(uuid) from public;
revoke all on function public.dismiss_room_attention(uuid) from public;
revoke all on function public.list_workspace_activity(uuid) from public;
grant execute on function public.mark_room_viewed(uuid) to authenticated;
grant execute on function public.dismiss_room_attention(uuid) to authenticated;
grant execute on function public.list_workspace_activity(uuid) to authenticated;
```

Add a matching comment above `isProposalOffered` in `apps/web/src/features/rooms/components/conversation.tsx`:

```ts
// Mirrored in SQL by list_workspace_activity's open_proposal CTE
// (supabase/migrations/20261109000001_workspace_activity.sql). Change both.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:db && pnpm test:sql`
Expected: all pgTAP files PASS (21/21 in `workspace_activity.test.sql`). SQL lint suite PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261109000001_workspace_activity.sql supabase/tests/workspace_activity.test.sql apps/web/src/features/rooms/components/conversation.tsx
git commit -m "feat(db): classify room activity for the Overview and working hats"
```

---

### Task 2: Contracts, reader and server actions

**Files:**
- Create: `packages/contracts/src/activity.ts`, `packages/contracts/src/activity.test.ts`
- Modify: `packages/contracts/src/index.ts` (add `export * from "./activity";`)
- Create: `apps/web/src/features/activity/activity-reader.ts`, `activity-reader.test.ts`, `actions.ts`, `actions.test.ts`

**Interfaces:**
- Consumes: Task 1 RPCs.
- Produces:
  - `RoomActivitySchema`, `type RoomActivity`, `type RoomActivityState = "idle" | "working" | "needs_you"`, `type RoomActivityReason = "asked" | "finished" | "stuck"` (from `@meld/contracts`)
  - `readWorkspaceActivity(client: ActivityRpcClient, workspaceId: string): Promise<RoomActivity[]>`
  - Server actions: `getWorkspaceActivity(workspaceId: string): Promise<RoomActivity[]>`, `markRoomViewed(roomId: string): Promise<void>`, `dismissRoomAttention(roomId: string): Promise<void>`, `dismissProposal(messageId: string): Promise<void>`

- [ ] **Step 1: Write the failing contract test**

`packages/contracts/src/activity.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { RoomActivitySchema } from "./activity";

const base = {
  roomId: "a4000000-0000-4000-8000-000000000001",
  projectId: "a7000000-0000-4000-8000-000000000001",
  roomName: "Inbox screen",
  state: "needs_you",
  reason: "finished",
  taskKind: "design_screen_generate",
  taskStatus: "completed",
  provider: "claude",
  proposalKind: null,
  proposalMessageId: null,
  occurredAt: "2026-11-09T10:00:00+00:00",
  lastActivityAt: "2026-11-09T10:00:00+00:00",
};

describe("RoomActivitySchema", () => {
  it("accepts a finished room", () => {
    expect(RoomActivitySchema.parse(base).reason).toBe("finished");
  });
  it("accepts an idle room with no task", () => {
    const idle = { ...base, state: "idle", reason: null, taskKind: null, taskStatus: null, provider: null, occurredAt: null, lastActivityAt: null };
    expect(RoomActivitySchema.parse(idle).state).toBe("idle");
  });
  it("rejects an unknown state", () => {
    expect(() => RoomActivitySchema.parse({ ...base, state: "busy" })).toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @meld/contracts exec vitest run src/activity.test.ts`
Expected: FAIL (cannot resolve `./activity`).

- [ ] **Step 3: Implement the contract**

`packages/contracts/src/activity.ts`:

```ts
import { z } from "zod";
import { AITaskKindSchema, AITaskStatusSchema, ProviderSchema } from "./ai";
import { RoomProposedActionSchema } from "./rooms";

export const RoomActivityStateSchema = z.enum(["idle", "working", "needs_you"]);
export type RoomActivityState = z.infer<typeof RoomActivityStateSchema>;

export const RoomActivityReasonSchema = z.enum(["asked", "finished", "stuck"]);
export type RoomActivityReason = z.infer<typeof RoomActivityReasonSchema>;

const ProposalKindSchema = z.enum(
  RoomProposedActionSchema.options.map((option) => option.shape.kind.value) as [
    "prd_generate", "prd_revise", "user_flow_generate", "decision_capture",
  ],
);

export const RoomActivitySchema = z.object({
  roomId: z.string().uuid(),
  projectId: z.string().uuid(),
  roomName: z.string(),
  state: RoomActivityStateSchema,
  reason: RoomActivityReasonSchema.nullable(),
  taskKind: AITaskKindSchema.nullable(),
  taskStatus: AITaskStatusSchema.nullable(),
  provider: ProviderSchema.nullable(),
  proposalKind: ProposalKindSchema.nullable(),
  proposalMessageId: z.string().uuid().nullable(),
  occurredAt: z.string().nullable(),
  lastActivityAt: z.string().nullable(),
});
export type RoomActivity = z.infer<typeof RoomActivitySchema>;
```

Add `export * from "./activity";` to `packages/contracts/src/index.ts`.

If `RoomProposedActionSchema.options[i].shape.kind.value` doesn't typecheck in this zod version, write the enum literally:
`z.enum(["prd_generate", "prd_revise", "user_flow_generate", "decision_capture"])`.

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @meld/contracts exec vitest run src/activity.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing reader + actions tests**

`apps/web/src/features/activity/activity-reader.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { readWorkspaceActivity, type ActivityRpcClient } from "./activity-reader";

const row = {
  room_id: "a4000000-0000-4000-8000-000000000001",
  project_id: "a7000000-0000-4000-8000-000000000001",
  room_name: "Inbox screen",
  state: "working",
  reason: null,
  task_kind: "design_screen_generate",
  task_status: "running",
  provider: "claude",
  proposal_kind: null,
  proposal_message_id: null,
  occurred_at: null,
  last_activity_at: "2026-11-09T10:00:00+00:00",
};

function client(result: { data: unknown; error: { message: string } | null }): ActivityRpcClient {
  return { rpc: vi.fn().mockResolvedValue(result) };
}

describe("readWorkspaceActivity", () => {
  it("maps rows to RoomActivity", async () => {
    const supabase = client({ data: [row], error: null });
    const result = await readWorkspaceActivity(supabase, "ws-1");
    expect(supabase.rpc).toHaveBeenCalledWith("list_workspace_activity", { target_workspace_id: "ws-1" });
    expect(result).toEqual([
      expect.objectContaining({ roomId: row.room_id, state: "working", taskStatus: "running" }),
    ]);
  });
  it("drops rows that fail validation instead of failing the whole list", async () => {
    const result = await readWorkspaceActivity(client({ data: [row, { ...row, state: "busy" }], error: null }), "ws-1");
    expect(result).toHaveLength(1);
  });
  it("throws a friendly error when the RPC fails", async () => {
    await expect(readWorkspaceActivity(client({ data: null, error: { message: "boom" } }), "ws-1"))
      .rejects.toThrow("We could not load what's happening in your projects.");
  });
});
```

`apps/web/src/features/activity/actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ rpc })),
}));

import { dismissProposal, dismissRoomAttention, getWorkspaceActivity, markRoomViewed } from "./actions";

beforeEach(() => rpc.mockReset());

describe("activity actions", () => {
  it("getWorkspaceActivity reads through the RPC", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await expect(getWorkspaceActivity("ws-1")).resolves.toEqual([]);
    expect(rpc).toHaveBeenCalledWith("list_workspace_activity", { target_workspace_id: "ws-1" });
  });
  it.each([
    ["markRoomViewed", markRoomViewed, "mark_room_viewed", { target_room_id: "r-1" }],
    ["dismissRoomAttention", dismissRoomAttention, "dismiss_room_attention", { target_room_id: "r-1" }],
    ["dismissProposal", dismissProposal, "dismiss_message_proposal", { target_message_id: "r-1" }],
  ])("%s calls its RPC", async (_name, action, fn, args) => {
    rpc.mockResolvedValue({ data: null, error: null });
    await action("r-1");
    expect(rpc).toHaveBeenCalledWith(fn, args);
  });
  it("write actions throw a friendly error", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "nope" } });
    await expect(markRoomViewed("r-1")).rejects.toThrow("We could not update that. Try again.");
  });
});
```

- [ ] **Step 6: Run them to verify they fail**

Run: `pnpm --filter web exec vitest run src/features/activity/activity-reader.test.ts src/features/activity/actions.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 7: Implement the reader and actions**

`apps/web/src/features/activity/activity-reader.ts`:

```ts
import { RoomActivitySchema, type RoomActivity } from "@meld/contracts";

export type ActivityRpcClient = {
  rpc: (
    fn: "list_workspace_activity",
    args: { target_workspace_id: string },
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

type ActivityRow = {
  room_id: string; project_id: string; room_name: string;
  state: string; reason: string | null;
  task_kind: string | null; task_status: string | null; provider: string | null;
  proposal_kind: string | null; proposal_message_id: string | null;
  occurred_at: string | null; last_activity_at: string | null;
};

const READ_ERROR = "We could not load what's happening in your projects.";

export async function readWorkspaceActivity(
  client: ActivityRpcClient,
  workspaceId: string,
): Promise<RoomActivity[]> {
  const { data, error } = await client.rpc("list_workspace_activity", {
    target_workspace_id: workspaceId,
  });
  if (error) throw new Error(READ_ERROR);
  const rows = (Array.isArray(data) ? data : []) as ActivityRow[];
  return rows.flatMap((row) => {
    const parsed = RoomActivitySchema.safeParse({
      roomId: row.room_id,
      projectId: row.project_id,
      roomName: row.room_name,
      state: row.state,
      reason: row.reason,
      taskKind: row.task_kind,
      taskStatus: row.task_status,
      provider: row.provider,
      proposalKind: row.proposal_kind,
      proposalMessageId: row.proposal_message_id,
      occurredAt: row.occurred_at,
      lastActivityAt: row.last_activity_at,
    });
    return parsed.success ? [parsed.data] : [];
  });
}
```

`apps/web/src/features/activity/actions.ts`:

```ts
"use server";

import type { RoomActivity } from "@meld/contracts";
import { createClient } from "@/lib/supabase/server";
import { readWorkspaceActivity, type ActivityRpcClient } from "./activity-reader";

const WRITE_ERROR = "We could not update that. Try again.";

async function client() {
  return createClient(new Headers());
}

export async function getWorkspaceActivity(workspaceId: string): Promise<RoomActivity[]> {
  const supabase = await client();
  return readWorkspaceActivity(supabase as unknown as ActivityRpcClient, workspaceId);
}

async function call(fn: string, args: Record<string, string>) {
  const supabase = await client();
  const { error } = await supabase.rpc(fn as never, args as never);
  if (error) throw new Error(WRITE_ERROR);
}

export async function markRoomViewed(roomId: string): Promise<void> {
  await call("mark_room_viewed", { target_room_id: roomId });
}

export async function dismissRoomAttention(roomId: string): Promise<void> {
  await call("dismiss_room_attention", { target_room_id: roomId });
}

export async function dismissProposal(messageId: string): Promise<void> {
  await call("dismiss_message_proposal", { target_message_id: messageId });
}
```

- [ ] **Step 8: Run tests and typecheck**

Run: `pnpm --filter web exec vitest run src/features/activity && pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/contracts/src/activity.ts packages/contracts/src/activity.test.ts packages/contracts/src/index.ts apps/web/src/features/activity
git commit -m "feat(web): read workspace activity and expose view/dismiss actions"
```

---

### Task 3: Project roll-up and wording

**Files:**
- Create: `apps/web/src/features/activity/rollup.ts`, `rollup.test.ts`, `describe.ts`, `describe.test.ts`

**Interfaces:**
- Consumes: `RoomActivity` (Task 2).
- Produces:
  - `type ProjectActivity = { projectId: string; state: RoomActivityState; room: RoomActivity | null }`. `room` is the working room (state working), the most recent needs-you room (state needs_you), or null.
  - `rollUpProjects(rooms: readonly RoomActivity[]): Map<string, ProjectActivity>`
  - `type NeedsYouAction = "Answer" | "Review" | "Fix"`
  - `describeNeedsYou(room: RoomActivity): { title: string; action: NeedsYouAction }` (only call for `state === "needs_you"`)
  - `describeHatLabel(projectOrTabName: string, room: RoomActivity | null, state: RoomActivityState): string`
  - `describeProjectStatus(project: ProjectActivity, lastActive: string | null, formatRelative: (iso: string) => string): string`

- [ ] **Step 1: Write the failing tests**

`rollup.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { RoomActivity } from "@meld/contracts";
import { rollUpProjects } from "./rollup";

function room(overrides: Partial<RoomActivity>): RoomActivity {
  return {
    roomId: crypto.randomUUID(), projectId: "p1", roomName: "Tab",
    state: "idle", reason: null, taskKind: null, taskStatus: null, provider: null,
    proposalKind: null, proposalMessageId: null, occurredAt: null, lastActivityAt: null,
    ...overrides,
  };
}

describe("rollUpProjects", () => {
  it("working beats needs-you", () => {
    const working = room({ state: "working" });
    const map = rollUpProjects([room({ state: "needs_you", reason: "finished", occurredAt: "2026-11-09T10:00:00Z" }), working]);
    expect(map.get("p1")).toEqual({ projectId: "p1", state: "working", room: working });
  });
  it("needs-you picks the most recent reason", () => {
    const older = room({ state: "needs_you", reason: "stuck", occurredAt: "2026-11-09T09:00:00Z" });
    const newer = room({ state: "needs_you", reason: "asked", occurredAt: "2026-11-09T10:00:00Z" });
    expect(rollUpProjects([older, newer]).get("p1")?.room).toBe(newer);
  });
  it("all idle is idle with no room", () => {
    expect(rollUpProjects([room({}), room({})]).get("p1")).toEqual({ projectId: "p1", state: "idle", room: null });
  });
  it("keeps projects separate", () => {
    const map = rollUpProjects([room({ projectId: "a", state: "working" }), room({ projectId: "b" })]);
    expect(map.get("a")?.state).toBe("working");
    expect(map.get("b")?.state).toBe("idle");
  });
});
```

`describe.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { RoomActivity } from "@meld/contracts";
import { describeHatLabel, describeNeedsYou, describeProjectStatus } from "./describe";

function needs(overrides: Partial<RoomActivity>): RoomActivity {
  return {
    roomId: "r", projectId: "p", roomName: "Onboarding", state: "needs_you", reason: "finished",
    taskKind: "room_reply", taskStatus: "completed", provider: "claude",
    proposalKind: null, proposalMessageId: null, occurredAt: null, lastActivityAt: null,
    ...overrides,
  };
}

describe("describeNeedsYou", () => {
  it.each([
    [{ reason: "asked", proposalKind: "prd_generate" }, "Write the PRD?", "Answer"],
    [{ reason: "asked", proposalKind: "prd_revise" }, "Update the PRD?", "Answer"],
    [{ reason: "asked", proposalKind: "user_flow_generate" }, "Map the user flow?", "Answer"],
    [{ reason: "asked", proposalKind: "decision_capture" }, "Capture a decision?", "Answer"],
    [{ reason: "finished", taskKind: "design_screen_generate" }, "New screens are ready", "Review"],
    [{ reason: "finished", taskKind: "user_flow_generate" }, "User flow is ready", "Review"],
    [{ reason: "finished", taskKind: "prd_generate" }, "PRD is ready", "Review"],
    [{ reason: "finished", taskKind: "prd_revise" }, "PRD is ready", "Review"],
    [{ reason: "finished", taskKind: "room_reply" }, "Orion replied", "Review"],
    [{ reason: "stuck", taskStatus: "needs_reauthentication", provider: "claude" }, "Sign in to Claude again", "Fix"],
    [{ reason: "stuck", taskStatus: "usage_limit_reached", provider: "codex" }, "Codex usage limit reached", "Fix"],
    [{ reason: "stuck", taskStatus: "needs_review" }, "A result needs a look", "Review"],
    [{ reason: "stuck", taskStatus: "failed" }, "Something went wrong", "Fix"],
  ] as const)("%o → %s / %s", (overrides, title, action) => {
    expect(describeNeedsYou(needs(overrides as Partial<RoomActivity>))).toEqual({ title, action });
  });
});

describe("describeHatLabel", () => {
  it("names working", () => expect(describeHatLabel("Orion", null, "working")).toBe("Orion: working"));
  it("names the reason", () =>
    expect(describeHatLabel("Mark", needs({ reason: "asked", proposalKind: "prd_generate" }), "needs_you"))
      .toBe("Mark needs you · Write the PRD?"));
});

describe("describeProjectStatus", () => {
  const rel = () => "Tuesday";
  it("working names the tab", () =>
    expect(describeProjectStatus({ projectId: "p", state: "working", room: needs({ state: "working", roomName: "Inbox screen" }) }, null, rel))
      .toBe("Working on Inbox screen…"));
  it("needs-you uses the title", () =>
    expect(describeProjectStatus({ projectId: "p", state: "needs_you", room: needs({}) }, null, rel)).toBe("Orion replied"));
  it("idle uses last activity", () =>
    expect(describeProjectStatus({ projectId: "p", state: "idle", room: null }, "2026-11-03T10:00:00Z", rel)).toBe("Last active Tuesday"));
  it("never active", () =>
    expect(describeProjectStatus({ projectId: "p", state: "idle", room: null }, null, rel)).toBe("No activity yet"));
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter web exec vitest run src/features/activity/rollup.test.ts src/features/activity/describe.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`rollup.ts`:

```ts
import type { RoomActivity, RoomActivityState } from "@meld/contracts";

export type ProjectActivity = {
  projectId: string;
  state: RoomActivityState;
  room: RoomActivity | null;
};

const time = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);

export function rollUpProjects(rooms: readonly RoomActivity[]): Map<string, ProjectActivity> {
  const result = new Map<string, ProjectActivity>();
  for (const room of rooms) {
    const current = result.get(room.projectId) ?? { projectId: room.projectId, state: "idle", room: null };
    if (current.state === "working") continue;
    if (room.state === "working") {
      result.set(room.projectId, { projectId: room.projectId, state: "working", room });
    } else if (room.state === "needs_you" &&
      (current.state !== "needs_you" || time(room.occurredAt) > time(current.room?.occurredAt ?? null))) {
      result.set(room.projectId, { projectId: room.projectId, state: "needs_you", room });
    } else {
      result.set(room.projectId, current);
    }
  }
  return result;
}
```

`describe.ts`:

```ts
import type { Provider, RoomActivity, RoomActivityState } from "@meld/contracts";
import type { ProjectActivity } from "./rollup";

export type NeedsYouAction = "Answer" | "Review" | "Fix";

const PROVIDER_NAMES: Record<Provider, string> = { claude: "Claude", codex: "Codex", deepseek: "DeepSeek" };
const providerName = (provider: Provider | null) => (provider ? PROVIDER_NAMES[provider] : "your AI");

export function describeNeedsYou(room: RoomActivity): { title: string; action: NeedsYouAction } {
  if (room.reason === "asked") {
    const titles = {
      prd_generate: "Write the PRD?",
      prd_revise: "Update the PRD?",
      user_flow_generate: "Map the user flow?",
      decision_capture: "Capture a decision?",
    } as const;
    return { title: room.proposalKind ? titles[room.proposalKind] : "Orion has a question", action: "Answer" };
  }
  if (room.reason === "stuck") {
    switch (room.taskStatus) {
      case "needs_reauthentication":
        return { title: `Sign in to ${providerName(room.provider)} again`, action: "Fix" };
      case "usage_limit_reached":
        return { title: `${providerName(room.provider)} usage limit reached`, action: "Fix" };
      case "needs_review":
        return { title: "A result needs a look", action: "Review" };
      default:
        return { title: "Something went wrong", action: "Fix" };
    }
  }
  switch (room.taskKind) {
    case "design_screen_generate":
      return { title: "New screens are ready", action: "Review" };
    case "user_flow_generate":
      return { title: "User flow is ready", action: "Review" };
    case "prd_generate":
    case "prd_revise":
    case "prd_section_revise":
      return { title: "PRD is ready", action: "Review" };
    default:
      return { title: "Orion replied", action: "Review" };
  }
}

export function describeHatLabel(name: string, room: RoomActivity | null, state: RoomActivityState): string {
  if (state === "working") return `${name}: working`;
  if (state === "needs_you" && room) return `${name} needs you · ${describeNeedsYou(room).title}`;
  return name;
}

export function describeProjectStatus(
  project: ProjectActivity,
  lastActive: string | null,
  formatRelative: (iso: string) => string,
): string {
  if (project.state === "working" && project.room) return `Working on ${project.room.roomName}…`;
  if (project.state === "needs_you" && project.room) return describeNeedsYou(project.room).title;
  return lastActive ? `Last active ${formatRelative(lastActive)}` : "No activity yet";
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter web exec vitest run src/features/activity`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/activity/rollup.ts apps/web/src/features/activity/rollup.test.ts apps/web/src/features/activity/describe.ts apps/web/src/features/activity/describe.test.ts
git commit -m "feat(web): roll room activity up to projects and word needs-you items"
```

---

### Task 4: Live activity provider

**Files:**
- Create: `apps/web/src/features/activity/workspace-activity-provider.tsx`, `workspace-activity-provider.test.tsx`

**Interfaces:**
- Consumes: `getWorkspaceActivity` (Task 2), `rollUpProjects` (Task 3).
- Produces:
  - `<WorkspaceActivityProvider workspaceId initial={RoomActivity[]}>`
  - `useWorkspaceActivity(): { rooms: RoomActivity[]; byRoom: Map<string, RoomActivity>; byProject: Map<string, ProjectActivity>; refresh: () => Promise<void> }`
  - Outside a provider, the hook returns empty maps and a no-op `refresh`, so components render as idle.
  - `ACTIVITY_POLL_VISIBLE_MS = 5000`, `ACTIVITY_POLL_HIDDEN_MS = 30000`.

- [ ] **Step 1: Write the failing test**

```tsx
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomActivity } from "@meld/contracts";

const getWorkspaceActivity = vi.fn();
vi.mock("./actions", () => ({ getWorkspaceActivity: (id: string) => getWorkspaceActivity(id) }));

import {
  ACTIVITY_POLL_HIDDEN_MS, ACTIVITY_POLL_VISIBLE_MS,
  WorkspaceActivityProvider, useWorkspaceActivity,
} from "./workspace-activity-provider";

const working: RoomActivity = {
  roomId: "r1", projectId: "p1", roomName: "Tab", state: "working", reason: null,
  taskKind: "room_reply", taskStatus: "running", provider: "claude",
  proposalKind: null, proposalMessageId: null, occurredAt: null, lastActivityAt: null,
};

function Probe() {
  const { byProject } = useWorkspaceActivity();
  return <output>{byProject.get("p1")?.state ?? "none"}</output>;
}

function setVisibility(value: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, value });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => { vi.useFakeTimers(); getWorkspaceActivity.mockReset(); setVisibility("visible"); });
afterEach(() => vi.useRealTimers());

describe("WorkspaceActivityProvider", () => {
  it("renders the initial snapshot", () => {
    render(<WorkspaceActivityProvider workspaceId="ws" initial={[working]}><Probe /></WorkspaceActivityProvider>);
    expect(screen.getByRole("status")).toHaveTextContent("working");
  });

  it("polls every 5s while visible", async () => {
    getWorkspaceActivity.mockResolvedValue([{ ...working, state: "idle" }]);
    render(<WorkspaceActivityProvider workspaceId="ws" initial={[working]}><Probe /></WorkspaceActivityProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(ACTIVITY_POLL_VISIBLE_MS); });
    expect(getWorkspaceActivity).toHaveBeenCalledWith("ws");
    expect(screen.getByRole("status")).toHaveTextContent("idle");
  });

  it("slows to 30s when hidden", async () => {
    getWorkspaceActivity.mockResolvedValue([working]);
    render(<WorkspaceActivityProvider workspaceId="ws" initial={[working]}><Probe /></WorkspaceActivityProvider>);
    act(() => setVisibility("hidden"));
    await act(async () => { await vi.advanceTimersByTimeAsync(ACTIVITY_POLL_VISIBLE_MS); });
    expect(getWorkspaceActivity).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(ACTIVITY_POLL_HIDDEN_MS); });
    expect(getWorkspaceActivity).toHaveBeenCalledTimes(1);
  });

  it("keeps the last good value when a poll fails", async () => {
    getWorkspaceActivity.mockRejectedValue(new Error("offline"));
    render(<WorkspaceActivityProvider workspaceId="ws" initial={[working]}><Probe /></WorkspaceActivityProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(ACTIVITY_POLL_VISIBLE_MS); });
    expect(screen.getByRole("status")).toHaveTextContent("working");
  });

  it("is idle outside a provider", () => {
    render(<Probe />);
    expect(screen.getByRole("status")).toHaveTextContent("none");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter web exec vitest run src/features/activity/workspace-activity-provider.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```tsx
"use client";

import type { RoomActivity } from "@meld/contracts";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getWorkspaceActivity } from "./actions";
import { rollUpProjects, type ProjectActivity } from "./rollup";

export const ACTIVITY_POLL_VISIBLE_MS = 5000;
export const ACTIVITY_POLL_HIDDEN_MS = 30000;

type WorkspaceActivity = {
  rooms: RoomActivity[];
  byRoom: Map<string, RoomActivity>;
  byProject: Map<string, ProjectActivity>;
  refresh: () => Promise<void>;
};

const EMPTY: WorkspaceActivity = {
  rooms: [], byRoom: new Map(), byProject: new Map(), refresh: async () => {},
};

const Context = createContext<WorkspaceActivity>(EMPTY);

export function WorkspaceActivityProvider({
  workspaceId, initial, children,
}: { workspaceId: string; initial: RoomActivity[]; children: ReactNode }) {
  const [rooms, setRooms] = useState(initial);
  const workspaceRef = useRef(workspaceId);
  workspaceRef.current = workspaceId;

  const refresh = useCallback(async () => {
    try {
      setRooms(await getWorkspaceActivity(workspaceRef.current));
    } catch {
      // Keep the last good snapshot; the next poll tries again.
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      const delay = document.visibilityState === "visible" ? ACTIVITY_POLL_VISIBLE_MS : ACTIVITY_POLL_HIDDEN_MS;
      timer = setTimeout(async () => { await refresh(); schedule(); }, delay);
    };
    schedule();
    document.addEventListener("visibilitychange", schedule);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", schedule); };
  }, [refresh]);

  const value = useMemo<WorkspaceActivity>(() => ({
    rooms,
    byRoom: new Map(rooms.map((room) => [room.roomId, room])),
    byProject: rollUpProjects(rooms),
    refresh,
  }), [rooms, refresh]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useWorkspaceActivity(): WorkspaceActivity {
  return useContext(Context);
}
```

- [ ] **Step 4: Run test**

Run: `pnpm --filter web exec vitest run src/features/activity/workspace-activity-provider.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/activity/workspace-activity-provider.tsx apps/web/src/features/activity/workspace-activity-provider.test.tsx
git commit -m "feat(web): poll workspace activity and share it through a provider"
```

---

### Task 5: The hat mark (web)

**Files:**
- Modify: `apps/web/src/ui/orion-talking-hat.tsx`, `apps/web/src/ui/orion-talking-hat.test.tsx`
- Create: `apps/web/src/ui/orion-hat-mark.tsx`, `orion-hat-mark.module.css`, `orion-hat-mark.test.tsx`

**Interfaces:**
- Produces:
  - `OrionTalkingHat` gains `tint?: string` (any CSS colour or `var(...)`). Each eye's iris, pupil and catchlight are wrapped in `<g data-part="look">`.
  - `<OrionHatMark state="working" | "needs_you" color={string} hop={boolean} label={string} size?: "sm" | "md" | "lg" />`. Sizes: `sm` = `var(--spacing-5)` (sidebar/tabs), `md` = `var(--spacing-10)` (Overview rows), `lg` = `calc(var(--spacing-12) * 3)`. The component renders an SVG with `role="img"` and `aria-label={label}`.

- [ ] **Step 1: Write the failing tests**

Append to `orion-talking-hat.test.tsx`:

```tsx
it("wraps each eye's gaze so it can be animated", () => {
  const { container } = render(<OrionTalkingHat appearance="avatar" decorative />);
  expect(container.querySelectorAll('[data-part="look"]').length).toBeGreaterThanOrEqual(2);
});

it("lays a colour tint over crown and brim when tint is set", () => {
  const { container } = render(<OrionTalkingHat appearance="avatar" decorative tint="var(--color-icon-blue)" />);
  const tint = container.querySelectorAll('[data-part="tint"] rect');
  expect(tint).toHaveLength(2);
  expect(tint[0]).toHaveAttribute("fill", "var(--color-icon-blue)");
});

it("has no tint layer by default", () => {
  const { container } = render(<OrionTalkingHat decorative />);
  expect(container.querySelector('[data-part="tint"]')).toBeNull();
});
```

`orion-hat-mark.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OrionHatMark } from "./orion-hat-mark";

describe("OrionHatMark", () => {
  it("working uses the neutral face and the sway", () => {
    render(<OrionHatMark state="working" color="var(--color-icon-blue)" hop={false} label="Orion: working" />);
    const hat = screen.getByRole("img", { name: "Orion: working" });
    expect(hat).toHaveAttribute("data-expression", "neutral");
    expect(hat).toHaveAttribute("data-hat-state", "working");
    expect(hat).not.toHaveAttribute("data-hop");
  });
  it("needs-you uses the curious face and hops only when asked", () => {
    const { rerender } = render(<OrionHatMark state="needs_you" color="var(--color-icon-orange)" hop label="Mark needs you" />);
    expect(screen.getByRole("img")).toHaveAttribute("data-expression", "curious");
    expect(screen.getByRole("img")).toHaveAttribute("data-hop", "true");
    rerender(<OrionHatMark state="needs_you" color="var(--color-icon-orange)" hop={false} label="Mark needs you" />);
    expect(screen.getByRole("img")).not.toHaveAttribute("data-hop");
  });
  it("tints with the project colour", () => {
    const { container } = render(<OrionHatMark state="working" color="var(--color-icon-teal)" hop={false} label="Mail: working" />);
    expect(container.querySelector('[data-part="tint"] rect')).toHaveAttribute("fill", "var(--color-icon-teal)");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter web exec vitest run src/ui/orion-talking-hat.test.tsx src/ui/orion-hat-mark.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Modify `OrionTalkingHat`**

In `apps/web/src/ui/orion-talking-hat.tsx`:

1. Add `tint?: string;` to `OrionTalkingHatProps` (doc comment: "Recolours crown and brim, e.g. a project colour. Keeps the leather's light and shade.") and destructure `tint` in the function signature.
2. Inside the `eye()` helper, wrap the three iris/pupil circles:
   ```tsx
   <g data-part="look">
     <circle cx={ix} cy={iy} r={irisR} fill={u("iris")} />
     <circle cx={ix} cy={iy} r={irisR} fill="none" stroke="#1a0f07" strokeWidth="1.4" />
     <circle cx={ix} cy={iy} r={avatar ? 6 : 5} fill="#070403" />
   </g>
   ```
   Wrap the catchlight `<ellipse …/>` in its own `<g data-part="look">…</g>`. The upper-lid paths stay between the two groups, so the lid still covers the iris.
3. Directly before the final outline `<use href={`#${i("crownShape")}`} fill="none" …/>`, add:
   ```tsx
   {tint ? (
     <g data-part="tint" style={{ mixBlendMode: "color" }}>
       <rect x="0" y="0" width="400" height="400" clipPath={u("crownClip")} fill={tint} />
       <rect x="0" y="0" width="400" height="400" clipPath={u("brimClip")} fill={tint} />
     </g>
   ) : null}
   ```
   Also add `style={{ isolation: "isolate" }}` on the root `<svg>` (merge with `props.style`) so the blend stays inside the hat.

- [ ] **Step 4: Implement `OrionHatMark`**

`apps/web/src/ui/orion-hat-mark.module.css`:

```css
.hat { display: block; flex: none; overflow: visible; transform-origin: 50% 95%; }
.sm { inline-size: var(--spacing-5); block-size: var(--spacing-5); }
.md { inline-size: var(--spacing-10); block-size: var(--spacing-10); }
.lg { inline-size: calc(var(--spacing-12) * 3); block-size: calc(var(--spacing-12) * 3); }

.hat [data-part^="eye-"] { transform-box: fill-box; transform-origin: center; }

.working { animation: hat-sway 2.8s ease-in-out infinite; }
.working [data-part="look"] { animation: hat-gaze 2.8s ease-in-out infinite; }

.needsYou [data-part^="eye-"] { animation: hat-blink 5s infinite; }
.needsYou[data-hop="true"] { transform-origin: 50% 100%; animation: hat-hop 6s ease-out infinite; animation-delay: var(--hat-hop-delay, 0s); }

@keyframes hat-sway { 0%, 100% { transform: skewX(5deg); } 50% { transform: skewX(-6deg); } }
@keyframes hat-gaze { 0%, 100% { transform: translate(-5px, 0); } 50% { transform: translate(6px, 0); } }
@keyframes hat-blink { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(0.08); } }
@keyframes hat-hop {
  0% { transform: translateY(0) scale(1, 1); }
  2% { transform: translateY(0) scale(1.12, 0.86); }
  5% { transform: translateY(-38%) scale(0.94, 1.08); }
  8% { transform: translateY(0) scale(1.1, 0.9); }
  10%, 100% { transform: translateY(0) scale(1, 1); }
}

@media (prefers-reduced-motion: reduce) {
  .working, .working [data-part="look"], .needsYou [data-part^="eye-"], .needsYou[data-hop="true"] { animation: none; }
}
```

(The `px` values inside the keyframes are SVG user units in the 400-unit viewBox, not layout pixels.)

`apps/web/src/ui/orion-hat-mark.tsx`:

```tsx
import { useId } from "react";
import styles from "./orion-hat-mark.module.css";
import { OrionTalkingHat } from "./orion-talking-hat";

export type OrionHatMarkProps = {
  state: "working" | "needs_you";
  color: string;
  hop: boolean;
  label: string;
  size?: "sm" | "md" | "lg";
};

/** A project's status as the Orion hat: swaying while working, curious (and in the sidebar hopping) when it needs you. */
export function OrionHatMark({ state, color, hop, label, size = "sm" }: OrionHatMarkProps) {
  // Stagger hops so several waiting projects don't jump in unison.
  const seed = useId().split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const working = state === "working";
  return (
    <OrionTalkingHat
      appearance="avatar"
      expression={working ? "neutral" : "curious"}
      tint={color}
      aria-label={label}
      className={[styles.hat, styles[size], working ? styles.working : styles.needsYou].join(" ")}
      data-hat-state={state}
      data-hop={!working && hop ? "true" : undefined}
      style={{ ["--hat-hop-delay" as string]: `${(seed % 6) * 0.4}s` }}
    />
  );
}
```

`OrionTalkingHat` sets `role="img"` and uses `props["aria-label"]` when `decorative` is false, which is the default. The `width`/`height` attributes it applies are overridden by the CSS size classes.

- [ ] **Step 5: Run tests + Astryx check + typecheck**

Run: `pnpm --filter web exec vitest run src/ui && pnpm check:astryx && pnpm --filter web typecheck`
Expected: PASS. If `check:astryx` flags the CSS module, compare with how `wave-text.module.css` passes, and follow the same pattern.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/ui/orion-talking-hat.tsx apps/web/src/ui/orion-talking-hat.test.tsx apps/web/src/ui/orion-hat-mark.tsx apps/web/src/ui/orion-hat-mark.module.css apps/web/src/ui/orion-hat-mark.test.tsx
git commit -m "feat(web): add the animated, project-tinted Orion status hat"
```

---

### Task 6: Hats in the web sidebar and tabs; provider in the layout

**Files:**
- Create: `apps/web/src/features/activity/components/project-status-mark.tsx`, `project-status-mark.test.tsx`
- Modify: `apps/web/src/app/(app)/[workspaceId]/layout.tsx`, `apps/web/src/ui/orion-sidebar.tsx`, `apps/web/src/features/projects/components/project-tabs.tsx`, and their tests (`layout.test.tsx`, `project-tabs.test.tsx`, plus the sidebar test if one exists, e.g. `orion-sidebar.test.tsx`).

**Interfaces:**
- Consumes: `useWorkspaceActivity` (Task 4), `describeHatLabel` (Task 3), `OrionHatMark` (Task 5), `getWorkspaceActivity` (Task 2).
- Produces: `<ProjectStatusMark name={string} color={string} state={RoomActivityState} room={RoomActivity | null} hop={boolean} fallback={ReactNode} />`. Renders `fallback` when idle. Otherwise renders an Astryx `Tooltip` (content = `describeHatLabel(...)`) around `OrionHatMark size="sm"`.

- [ ] **Step 1: Write the failing tests**

`project-status-mark.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RoomActivity } from "@meld/contracts";
import { ProjectStatusMark } from "./project-status-mark";

const asked: RoomActivity = {
  roomId: "r", projectId: "p", roomName: "Onboarding", state: "needs_you", reason: "asked",
  taskKind: "room_reply", taskStatus: "completed", provider: "claude",
  proposalKind: "prd_generate", proposalMessageId: "m", occurredAt: null, lastActivityAt: null,
};

describe("ProjectStatusMark", () => {
  it("shows the fallback glyph when idle", () => {
    render(<ProjectStatusMark name="Mail" color="var(--color-icon-teal)" state="idle" room={null} hop fallback={<i data-testid="glyph" />} />);
    expect(screen.getByTestId("glyph")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });
  it("shows a swaying hat when working", () => {
    render(<ProjectStatusMark name="Orion" color="var(--color-icon-blue)" state="working" room={null} hop fallback={null} />);
    expect(screen.getByRole("img", { name: "Orion: working" })).toHaveAttribute("data-hat-state", "working");
  });
  it("shows a hopping curious hat labelled with the reason", () => {
    render(<ProjectStatusMark name="Mark" color="var(--color-icon-orange)" state="needs_you" room={asked} hop fallback={null} />);
    const hat = screen.getByRole("img", { name: "Mark needs you · Write the PRD?" });
    expect(hat).toHaveAttribute("data-hop", "true");
  });
});
```

In the existing `project-tabs.test.tsx`, add a case that wraps `ProjectTabs` in `WorkspaceActivityProvider` with `initial` = one `working` room for a tab id. Assert `getByRole("img", { name: "<tab name>: working" })` exists and has no `data-hop`.

In `layout.test.tsx`, add `vi.mock("@/features/activity/actions", () => ({ getWorkspaceActivity: vi.fn().mockResolvedValue([]) }))` and assert that the layout still renders (it already renders the sidebar; the provider must not break it). If the sidebar has a test file, add: "the first nav item is labelled Overview".

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter web exec vitest run src/features/activity/components src/features/projects/components/project-tabs.test.tsx "src/app/(app)/[workspaceId]/layout.test.tsx"`
Expected: FAIL.

- [ ] **Step 3: Implement `ProjectStatusMark`**

```tsx
"use client";

import type { RoomActivity, RoomActivityState } from "@meld/contracts";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import type { ReactNode } from "react";
import { OrionHatMark } from "@/ui/orion-hat-mark";
import { describeHatLabel } from "../describe";

export function ProjectStatusMark({
  name, color, state, room, hop, fallback,
}: {
  name: string; color: string; state: RoomActivityState;
  room: RoomActivity | null; hop: boolean; fallback: ReactNode;
}) {
  if (state === "idle") return <>{fallback}</>;
  const label = describeHatLabel(name, room, state);
  return (
    <Tooltip content={label} hasHoverIndication={false}>
      <OrionHatMark state={state} color={color} hop={hop} label={label} />
    </Tooltip>
  );
}
```

If `Tooltip` needs a focusable or ref-forwarding child and the SVG doesn't qualify, wrap it with the Astryx `Box` (check `pnpm exec astryx component Box`). Don't use a raw `<span>`.

- [ ] **Step 4: Wire the provider into the layout**

In `apps/web/src/app/(app)/[workspaceId]/layout.tsx`:
- Import `getWorkspaceActivity` and `WorkspaceActivityProvider`.
- Add `getWorkspaceActivity(workspaceId).catch(() => [])` to the existing `Promise.all`, as `initialActivity`.
- Wrap the whole returned `<AppFrame …>…</AppFrame>` in `<WorkspaceActivityProvider workspaceId={workspaceId} initial={initialActivity}>`.

- [ ] **Step 5: Sidebar**

In `apps/web/src/ui/orion-sidebar.tsx`:
- Change the first item's `label="Home"` to `label="Overview"`, and update the header comment "(Home · Inspiration · Taste)" to "(Overview · Inspiration · Taste)".
- `const { byProject } = useWorkspaceActivity();`
- Replace the project `icon={() => (<Glyph …/>)}` with:

```tsx
icon={() => {
  const activity = byProject.get(project.id);
  return (
    <ProjectStatusMark
      name={project.name}
      color={PROJECT_COLOR_VARS[project.color]}
      state={activity?.state ?? "idle"}
      room={activity?.room ?? null}
      hop
      fallback={<Glyph pack="filled" size="xs" fill={PROJECT_COLOR_VARS[project.color]} aria-hidden="true" />}
    />
  );
}}
```

- [ ] **Step 6: Tabs**

In `project-tabs.tsx`, `const { byRoom } = useWorkspaceActivity();`, then give each visible `<Tab>`:

```tsx
icon={(() => {
  const room = byRoom.get(tab.id);
  if (!room || room.state === "idle") return undefined;
  return (
    <ProjectStatusMark
      name={tab.name}
      color={PROJECT_COLOR_VARS[project.color]}
      state={room.state}
      room={room}
      hop={false}
      fallback={null}
    />
  );
})()}
```

- [ ] **Step 7: Run tests, Astryx, typecheck**

Run: `pnpm --filter web exec vitest run src && pnpm check:astryx && pnpm --filter web typecheck`
Expected: PASS. Update any existing test that asserted the text "Home" to "Overview".

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/features/activity/components apps/web/src/ui/orion-sidebar.tsx apps/web/src/features/projects/components/project-tabs.tsx apps/web/src/features/projects/components/project-tabs.test.tsx "apps/web/src/app/(app)/[workspaceId]/layout.tsx" "apps/web/src/app/(app)/[workspaceId]/layout.test.tsx"
git commit -m "feat(web): show working and needs-you hats in the sidebar and tabs"
```

---

### Task 7: Clear "finished" when a tab is opened

**Files:**
- Create: `apps/web/src/features/activity/components/mark-room-viewed.tsx`, `mark-room-viewed.test.tsx`
- Modify: `apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.tsx` (+ its test)

**Interfaces:**
- Consumes: `markRoomViewed` (Task 2), `useWorkspaceActivity` (Task 4).
- Produces: `<MarkRoomViewed roomId={string} />`, which renders nothing.

- [ ] **Step 1: Write the failing test**

```tsx
import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomActivity } from "@meld/contracts";

const markRoomViewed = vi.fn().mockResolvedValue(undefined);
const getWorkspaceActivity = vi.fn();
vi.mock("../actions", () => ({
  markRoomViewed: (id: string) => markRoomViewed(id),
  getWorkspaceActivity: (id: string) => getWorkspaceActivity(id),
}));

import { WorkspaceActivityProvider } from "../workspace-activity-provider";
import { MarkRoomViewed } from "./mark-room-viewed";

const finished: RoomActivity = {
  roomId: "r1", projectId: "p1", roomName: "Tab", state: "needs_you", reason: "finished",
  taskKind: "room_reply", taskStatus: "completed", provider: "claude",
  proposalKind: null, proposalMessageId: null, occurredAt: "2026-11-09T10:00:00Z", lastActivityAt: null,
};

beforeEach(() => { markRoomViewed.mockClear(); getWorkspaceActivity.mockResolvedValue([]); });

describe("MarkRoomViewed", () => {
  it("marks the room viewed on mount", async () => {
    await act(async () => { render(<MarkRoomViewed roomId="r1" />); });
    expect(markRoomViewed).toHaveBeenCalledWith("r1");
  });

  it("marks again when this room turns finished while open", async () => {
    await act(async () => {
      render(
        <WorkspaceActivityProvider workspaceId="ws" initial={[finished]}>
          <MarkRoomViewed roomId="r1" />
        </WorkspaceActivityProvider>,
      );
    });
    // once for mount, once because the room is 'finished' — de-duplicated to the same occurredAt
    expect(markRoomViewed).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter web exec vitest run src/features/activity/components/mark-room-viewed.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
"use client";

import { useEffect } from "react";
import { markRoomViewed } from "../actions";
import { useWorkspaceActivity } from "../workspace-activity-provider";

/** Opening a tab means you've seen its finished work: clear it, and keep clearing while you watch. */
export function MarkRoomViewed({ roomId }: { roomId: string }) {
  const { byRoom, refresh } = useWorkspaceActivity();
  const room = byRoom.get(roomId);
  const finishedAt = room?.reason === "finished" ? room.occurredAt : null;

  useEffect(() => {
    markRoomViewed(roomId).then(refresh, () => {});
  }, [roomId, refresh]);

  useEffect(() => {
    if (finishedAt) markRoomViewed(roomId).then(refresh, () => {});
  }, [roomId, finishedAt, refresh]);

  return null;
}
```

- [ ] **Step 4: Mount it on the room page**

In `apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.tsx`, render `<MarkRoomViewed roomId={roomId} />` once, as the first child inside the page's top-level returned element. Use the same `roomId` variable the page already reads from `params`. In the page test, mock `@/features/activity/actions` (`markRoomViewed: vi.fn().mockResolvedValue(undefined)`) so existing assertions keep passing.

- [ ] **Step 5: Run tests**

Run: `pnpm --filter web exec vitest run src/features/activity "src/app/(app)/[workspaceId]/rooms"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/activity/components/mark-room-viewed.tsx apps/web/src/features/activity/components/mark-room-viewed.test.tsx "apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.tsx" "apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.test.tsx"
git commit -m "feat(web): clear finished work when its tab is opened"
```

---

### Task 8: Overview page

**Files:**
- Create: `apps/web/src/features/activity/components/needs-you-list.tsx`, `needs-you-list.test.tsx`, `all-projects-list.tsx`, `all-projects-list.test.tsx`, `overview-heading.tsx`, `overview-heading.test.tsx`
- Modify: `apps/web/src/app/(app)/[workspaceId]/page.tsx` (+ a page test if one exists)

**Interfaces:**
- Consumes: `useWorkspaceActivity`, `describeNeedsYou`, `describeProjectStatus`, `dismissRoomAttention`, `dismissProposal`, `OrionHatMark`, existing `AttentionItem` + `acknowledgeMention` (`features/home`), `ClientTimestamp`, `PROJECT_COLOR_VARS`, `PROJECT_ICON_COMPONENTS`, `ProjectSummary`.
- Produces:
  - `<NeedsYouList workspaceId projects={ProjectSummary[]} mentions={AttentionItem[]} />`
  - `<AllProjectsList workspaceId projects={ProjectSummary[]} tabCounts={Record<string, number>} />`
  - `<OverviewHeading projectCount={number} />` (greeting + "N projects · N working · N need you" from the hook)

- [ ] **Step 1: Write the failing tests**

`needs-you-list.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { RoomActivity } from "@meld/contracts";

const dismissRoomAttention = vi.fn().mockResolvedValue(undefined);
const dismissProposal = vi.fn().mockResolvedValue(undefined);
vi.mock("../actions", () => ({
  dismissRoomAttention: (id: string) => dismissRoomAttention(id),
  dismissProposal: (id: string) => dismissProposal(id),
  getWorkspaceActivity: vi.fn().mockResolvedValue([]),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { WorkspaceActivityProvider } from "../workspace-activity-provider";
import { NeedsYouList } from "./needs-you-list";

const project = { id: "p1", name: "Mark", icon: "rocket", color: "orange" } as never;
const base: RoomActivity = {
  roomId: "r1", projectId: "p1", roomName: "Onboarding", state: "needs_you", reason: "asked",
  taskKind: "room_reply", taskStatus: "completed", provider: "claude",
  proposalKind: "prd_generate", proposalMessageId: "m1",
  occurredAt: "2026-11-09T10:00:00Z", lastActivityAt: null,
};

function renderList(rooms: RoomActivity[]) {
  return render(
    <WorkspaceActivityProvider workspaceId="ws" initial={rooms}>
      <NeedsYouList workspaceId="ws" projects={[project]} mentions={[]} />
    </WorkspaceActivityProvider>,
  );
}

describe("NeedsYouList", () => {
  it("lists an asked item with project › tab and an Answer link to the room", () => {
    renderList([base]);
    expect(screen.getByText("Write the PRD?")).toBeInTheDocument();
    expect(screen.getByText("Mark › Onboarding")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Answer" })).toHaveAttribute("href", "/ws/rooms/r1");
  });
  it("dismissing an asked item dismisses the proposal", async () => {
    renderList([base]);
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(dismissProposal).toHaveBeenCalledWith("m1");
  });
  it("dismissing a stuck item dismisses the room attention", async () => {
    renderList([{ ...base, reason: "stuck", taskStatus: "failed", proposalKind: null, proposalMessageId: null }]);
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(dismissRoomAttention).toHaveBeenCalledWith("r1");
  });
  it("finished items have Review and no Dismiss", () => {
    renderList([{ ...base, reason: "finished", proposalKind: null, proposalMessageId: null }]);
    expect(screen.getByRole("link", { name: "Review" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();
  });
  it("shows the caught-up state when nothing needs you", () => {
    renderList([]);
    expect(screen.getByText("You're all caught up")).toBeInTheDocument();
  });
});
```

`all-projects-list.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RoomActivity } from "@meld/contracts";
vi.mock("../actions", () => ({ getWorkspaceActivity: vi.fn().mockResolvedValue([]) }));
import { WorkspaceActivityProvider } from "../workspace-activity-provider";
import { AllProjectsList } from "./all-projects-list";

const projects = [
  { id: "p1", name: "Orion", icon: "rocket", color: "blue" },
  { id: "p2", name: "Portfolio", icon: "rocket", color: "gray" },
] as never;
const working: RoomActivity = {
  roomId: "r1", projectId: "p1", roomName: "Mac frame", state: "working", reason: null,
  taskKind: "room_reply", taskStatus: "running", provider: "claude",
  proposalKind: null, proposalMessageId: null, occurredAt: null, lastActivityAt: "2026-11-09T10:00:00Z",
};

describe("AllProjectsList", () => {
  it("shows each project with its status line and a link", () => {
    render(
      <WorkspaceActivityProvider workspaceId="ws" initial={[working]}>
        <AllProjectsList workspaceId="ws" projects={projects} tabCounts={{ p1: 3, p2: 1 }} />
      </WorkspaceActivityProvider>,
    );
    expect(screen.getByText("Working on Mac frame…")).toBeInTheDocument();
    expect(screen.getByText("No activity yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Orion/ })).toHaveAttribute("href", "/ws/projects/p1");
    expect(screen.getByRole("img", { name: "Orion: working" })).not.toHaveAttribute("data-hop");
  });
});
```

`overview-heading.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
vi.mock("../actions", () => ({ getWorkspaceActivity: vi.fn().mockResolvedValue([]) }));
import { WorkspaceActivityProvider } from "../workspace-activity-provider";
import { OverviewHeading } from "./overview-heading";

describe("OverviewHeading", () => {
  it("summarises counts", () => {
    render(
      <WorkspaceActivityProvider workspaceId="ws" initial={[
        { roomId: "a", projectId: "p1", roomName: "x", state: "working", reason: null, taskKind: null, taskStatus: null, provider: null, proposalKind: null, proposalMessageId: null, occurredAt: null, lastActivityAt: null },
        { roomId: "b", projectId: "p2", roomName: "y", state: "needs_you", reason: "finished", taskKind: null, taskStatus: null, provider: null, proposalKind: null, proposalMessageId: null, occurredAt: null, lastActivityAt: null },
      ]}>
        <OverviewHeading projectCount={4} />
      </WorkspaceActivityProvider>,
    );
    expect(screen.getByText("4 projects · 1 working · 1 needs you")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter web exec vitest run src/features/activity/components`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `OverviewHeading`**

```tsx
"use client";

import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useIsMounted } from "@/ui/use-is-mounted";
import { useWorkspaceActivity } from "../workspace-activity-provider";

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function OverviewHeading({ projectCount }: { projectCount: number }) {
  const { byProject } = useWorkspaceActivity();
  const isMounted = useIsMounted();
  const states = [...byProject.values()];
  const working = states.filter((p) => p.state === "working").length;
  const needsYou = states.filter((p) => p.state === "needs_you").length;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return (
    <VStack gap={1}>
      <Heading level={1}>{isMounted ? greeting(new Date().getHours()) : "Overview"}</Heading>
      <Text type="body" color="secondary">
        {`${plural(projectCount, "project", "projects")} · ${working} working · ${needsYou} ${needsYou === 1 ? "needs" : "need"} you`}
      </Text>
    </VStack>
  );
}
```

Check `apps/web/src/ui/use-is-mounted.ts` for the exact export name, and use it. Check `pnpm exec astryx component Text` for the secondary-colour prop name (`color="secondary"` or `variant`), and use what it documents.

- [ ] **Step 4: Implement `NeedsYouList`**

```tsx
"use client";

import type { RoomActivity } from "@meld/contracts";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { List, ListItem } from "@astryxdesign/core/List";
import { VStack } from "@astryxdesign/core/VStack";
import { useState } from "react";
import type { AttentionItem } from "@/features/home/attention/types";
import { NeedsAttention } from "@/features/home/components/needs-attention";
import { PROJECT_COLOR_VARS } from "@/features/projects/project-icons";
import type { ProjectSummary } from "@/features/projects/schemas";
import { ClientTimestamp } from "@/ui/client-timestamp";
import { OrionHatMark } from "@/ui/orion-hat-mark";
import { PixelCheckCircle as CheckCircle } from "@/ui/pixel-icons";
import { dismissProposal, dismissRoomAttention } from "../actions";
import { describeHatLabel, describeNeedsYou } from "../describe";
import { useWorkspaceActivity } from "../workspace-activity-provider";

const time = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);

export function NeedsYouList({
  workspaceId, projects, mentions,
}: { workspaceId: string; projects: ProjectSummary[]; mentions: AttentionItem[] }) {
  const { rooms, refresh } = useWorkspaceActivity();
  const [error, setError] = useState<string | null>(null);
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const items = rooms
    .filter((room) => room.state === "needs_you" && projectById.has(room.projectId))
    .sort((a, b) => time(b.occurredAt) - time(a.occurredAt));

  async function dismiss(room: RoomActivity) {
    setError(null);
    try {
      if (room.reason === "asked" && room.proposalMessageId) await dismissProposal(room.proposalMessageId);
      else await dismissRoomAttention(room.roomId);
      await refresh();
    } catch {
      setError("We could not dismiss that. Try again.");
    }
  }

  return (
    <VStack gap={3}>
      <Heading level={2}>Needs you</Heading>
      {error ? <Banner status="error" title={error} /> : null}
      {items.length === 0 && mentions.length === 0 ? (
        <EmptyState
          icon={<Icon icon={CheckCircle} size="lg" />}
          title="You're all caught up"
          description="Questions, finished work and anything stuck will show up here."
          headingLevel={3}
          isCompact
        />
      ) : (
        <List hasDividers>
          {items.map((room) => {
            const project = projectById.get(room.projectId)!;
            const { title, action } = describeNeedsYou(room);
            const canDismiss = room.reason === "asked" || room.reason === "stuck";
            return (
              <ListItem
                key={room.roomId}
                label={title}
                description={`${project.name} › ${room.roomName}`}
                startContent={
                  <OrionHatMark state="needs_you" hop={false} size="md"
                    color={PROJECT_COLOR_VARS[project.color]}
                    label={describeHatLabel(project.name, room, "needs_you")} />
                }
                endContent={
                  <HStack gap={2} vAlign="center">
                    {room.occurredAt ? <ClientTimestamp value={room.occurredAt} /> : null}
                    {canDismiss ? (
                      <Button label="Dismiss" variant="ghost" size="sm" onClick={() => dismiss(room)} />
                    ) : null}
                    <Button label={action} variant="primary" size="sm" href={`/${workspaceId}/rooms/${room.roomId}`} />
                  </HStack>
                }
              />
            );
          })}
        </List>
      )}
      {mentions.length > 0 ? <NeedsAttention items={mentions} /> : null}
    </VStack>
  );
}
```

Before relying on `ListItem`'s `startContent` and `Button`'s `href`, run `pnpm exec astryx component List` and `pnpm exec astryx component Button`. If `Button` has no `href`, use the Astryx `LinkButton` (or whatever `astryx search "link button"` returns) so the action renders as a link. The test expects `role="link"`. If `ListItem` has no start slot, use the slot it documents for leading media.

`NeedsAttention` renders its own "Needs attention" heading. Only mentions are passed to it now, so change its heading text to "Mentions" and update `needs-attention.test.tsx` to match.

- [ ] **Step 5: Implement `AllProjectsList`**

```tsx
"use client";

import { Heading } from "@astryxdesign/core/Heading";
import { List, ListItem } from "@astryxdesign/core/List";
import { VStack } from "@astryxdesign/core/VStack";
import { PROJECT_COLOR_VARS, PROJECT_ICON_COMPONENTS } from "@/features/projects/project-icons";
import type { ProjectSummary } from "@/features/projects/schemas";
import { OrionHatMark } from "@/ui/orion-hat-mark";
import { describeHatLabel, describeProjectStatus } from "../describe";
import { useWorkspaceActivity } from "../workspace-activity-provider";

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
function formatRelative(iso: string) {
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days === 0) return "today";
  if (days > -7) return relative.format(days, "day");
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function AllProjectsList({
  workspaceId, projects, tabCounts,
}: { workspaceId: string; projects: ProjectSummary[]; tabCounts: Record<string, number> }) {
  const { rooms, byProject } = useWorkspaceActivity();
  const lastActive = (projectId: string) =>
    rooms.filter((room) => room.projectId === projectId && room.lastActivityAt)
      .map((room) => room.lastActivityAt!).sort().at(-1) ?? null;

  return (
    <VStack gap={3}>
      <Heading level={2}>All projects</Heading>
      <List hasDividers>
        {projects.map((project) => {
          const activity = byProject.get(project.id) ?? { projectId: project.id, state: "idle" as const, room: null };
          const Glyph = PROJECT_ICON_COMPONENTS[project.icon];
          const color = PROJECT_COLOR_VARS[project.color];
          const count = tabCounts[project.id] ?? 0;
          return (
            <ListItem
              key={project.id}
              label={project.name}
              description={`${count} ${count === 1 ? "tab" : "tabs"} · ${describeProjectStatus(activity, lastActive(project.id), formatRelative)}`}
              href={`/${workspaceId}/projects/${project.id}`}
              startContent={
                activity.state === "idle"
                  ? <Glyph pack="filled" size="md" fill={color} aria-hidden="true" />
                  : <OrionHatMark state={activity.state} color={color} hop={false} size="md"
                      label={describeHatLabel(project.name, activity.room, activity.state)} />
              }
            />
          );
        })}
      </List>
    </VStack>
  );
}
```

The test looks for the status text on its own. If `description` concatenation breaks `getByText("Working on Mac frame…")`, change the assertion to `getByText(/Working on Mac frame…/)`.

- [ ] **Step 6: Rewrite the page**

In `apps/web/src/app/(app)/[workspaceId]/page.tsx`, keep the data loading and background handling. Replace the `<VStack>` contents with:

```tsx
<OverviewHeading projectCount={projects.length} />
{projects.length === 0 ? (
  <NoProjectsEmptyState />
) : (
  <>
    <NeedsYouList workspaceId={workspaceId} projects={projects} mentions={attentionItems} />
    <AllProjectsList workspaceId={workspaceId} projects={projects} tabCounts={tabCounts} />
    <StartingPoints workspaceId={workspaceId} projectId={projects[0].id} />
  </>
)}
```

Here `const tabCounts = Object.fromEntries(projects.map((p) => [p.id, rooms.filter((r) => r.projectId === p.id).length]));`. Delete the old `<Heading level={1}>What are you building?</Heading>` and the old `NeedsAttention` render. Update any page test accordingly.

- [ ] **Step 7: Run tests, Astryx, typecheck**

Run: `pnpm --filter web exec vitest run src && pnpm check:astryx && pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/features/activity/components apps/web/src/features/home/components "apps/web/src/app/(app)/[workspaceId]/page.tsx"
git commit -m "feat(web): turn Home into the Overview with Needs you and All projects"
```

---

### Task 9: Activity in the native frame snapshot

**Files:**
- Modify: `apps/web/src/features/native/bridge.ts`, `apps/web/src/features/native/native-frame-bridge.tsx`, `native-frame-bridge.test.tsx`
- Create: `apps/mac/Sources/OrionAppCore/Frame/FrameActivity.swift`
- Modify: `apps/mac/Sources/OrionAppCore/Frame/FrameSnapshot.swift`, `apps/mac/Tests/OrionAppCoreTests/FrameTests.swift`

**Interfaces:**
- Consumes: `useWorkspaceActivity`, `describeHatLabel`.
- Produces:
  - TS: `FrameSnapshot.activity: { projects: FrameActivityEntry[]; tabs: FrameActivityEntry[] }` where `FrameActivityEntry = { id: string; state: "working" | "needs_you"; label: string }`. Idle entries are omitted.
  - Swift: `public struct FrameActivity: Equatable, Sendable { public enum State: String, Sendable { case working, needsYou = "needs_you" }; public let id: String; public let state: State; public let label: String }`. `FrameSnapshot` gains `public let projectActivity: [String: FrameActivity]` and `public let tabActivity: [String: FrameActivity]`, both keyed by id. They default to empty when the field is missing (older web builds).

- [ ] **Step 1: Write the failing tests**

Swift, append to `FrameTests.swift`:

```swift
@Test func decodesActivity() throws {
    let snapshot = try #require(FrameSnapshot.decode([
        "workspaceId": "ws", "path": "/ws",
        "activity": [
            "projects": [["id": "p1", "state": "working", "label": "Orion: working"]],
            "tabs": [["id": "t1", "state": "needs_you", "label": "Mark needs you · Write the PRD?"],
                     ["id": "bad", "state": "sleeping", "label": "x"]],
        ],
    ]))
    #expect(snapshot.projectActivity["p1"]?.state == .working)
    #expect(snapshot.tabActivity["t1"]?.label == "Mark needs you · Write the PRD?")
    #expect(snapshot.tabActivity["bad"] == nil)
}

@Test func missingActivityIsEmpty() throws {
    let snapshot = try #require(FrameSnapshot.decode(["workspaceId": "ws", "path": "/ws"]))
    #expect(snapshot.projectActivity.isEmpty && snapshot.tabActivity.isEmpty)
}
```

If `FrameTests.swift` uses XCTest rather than Swift Testing, write the same assertions with `XCTAssert…`. Match the file's existing style.

TS, in `native-frame-bridge.test.tsx`: render `NativeFrameBridge` inside `WorkspaceActivityProvider` with `initial` = one working room `r1` in project `p1`. Assert that the posted frame message includes

```ts
activity: {
  projects: [{ id: "p1", state: "working", label: "<project name>: working" }],
  tabs: [{ id: "r1", state: "working", label: "<tab name>: working" }],
}
```

Follow how the existing tests capture `postToNative`.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/mac && swift test --filter FrameTests` and `pnpm --filter web exec vitest run src/features/native/native-frame-bridge.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement Swift**

`FrameActivity.swift`:

```swift
import Foundation

/// A project's or tab's live AI state, as the web page last reported it.
/// Idle is never sent, so absence means idle.
public struct FrameActivity: Equatable, Sendable {
    public enum State: String, Sendable {
        case working
        case needsYou = "needs_you"
    }

    public let id: String
    public let state: State
    /// Ready-to-show tooltip / accessibility text, e.g. "Mark needs you · Write the PRD?".
    public let label: String

    public init(id: String, state: State, label: String) {
        self.id = id
        self.state = state
        self.label = label
    }

    static func decodeMap(_ rows: Any?) -> [String: FrameActivity] {
        let entries = (rows as? [[String: Any]] ?? []).prefix(FrameSnapshot.maxItems).compactMap { row -> FrameActivity? in
            guard let id = row["id"] as? String, let raw = row["state"] as? String,
                  let state = State(rawValue: raw), let label = row["label"] as? String else { return nil }
            return FrameActivity(id: id, state: state, label: label)
        }
        return Dictionary(entries.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    }
}
```

In `FrameSnapshot.swift`:
- Add `public let projectActivity: [String: FrameActivity]` and `public let tabActivity: [String: FrameActivity]`.
- Extend `init` with `projectActivity: [String: FrameActivity] = [:], tabActivity: [String: FrameActivity] = [:]`.
- In `decode`, read `let activity = fields["activity"] as? [String: Any]` and pass `FrameActivity.decodeMap(activity?["projects"])` and `FrameActivity.decodeMap(activity?["tabs"])`.

- [ ] **Step 4: Implement TS**

In `bridge.ts`:

```ts
export type FrameActivityEntry = { id: string; state: "working" | "needs_you"; label: string };
// add to FrameSnapshot:
  activity: { projects: FrameActivityEntry[]; tabs: FrameActivityEntry[] };
```

In `native-frame-bridge.tsx`: `const { byRoom, byProject } = useWorkspaceActivity();`, then build `activity` with `useMemo`:

```ts
const activity = useMemo(() => ({
  projects: projects.flatMap((project) => {
    const entry = byProject.get(project.id);
    return entry && entry.state !== "idle"
      ? [{ id: project.id, state: entry.state, label: describeHatLabel(project.name, entry.room, entry.state) }]
      : [];
  }),
  tabs: tabs.flatMap((tab) => {
    const room = byRoom.get(tab.id);
    return room && room.state !== "idle"
      ? [{ id: tab.id, state: room.state, label: describeHatLabel(tab.name, room, room.state) }]
      : [];
  }),
}), [projects, tabs, byProject, byRoom]);
```

Then add `activity` to the `snapshot` memo and its dependency list. The component's props type is `Omit<FrameSnapshot, "path">`, so change it to `Omit<FrameSnapshot, "path" | "activity">`.

- [ ] **Step 5: Run tests**

Run: `cd apps/mac && swift test --filter FrameTests && cd ../.. && pnpm --filter web exec vitest run src/features/native && pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/native apps/mac/Sources/OrionAppCore/Frame apps/mac/Tests/OrionAppCoreTests/FrameTests.swift
git commit -m "feat: send project and tab activity to the native Orion frame"
```

---

### Task 10: Hat frames and the SwiftUI hat

**Files:**
- Create: `scripts/mascot/export-hat-frames.mjs`, `scripts/mascot/render-hat.tsx`
- Create (generated, committed): `packages/orion-design-system/Sources/OrionDesignSystem/Resources/Mascot/hat-neutral-0.png` … `hat-neutral-4.png`, `hat-curious.png`
- Create: `packages/orion-design-system/Sources/OrionDesignSystem/Components/OrionHatMark.swift`
- Test: `packages/orion-design-system/Tests/OrionDesignSystemTests/OrionHatMarkTests.swift`

**Interfaces:**
- Consumes: `OrionTalkingHat` with `data-part="look"` (Task 5).
- Produces (public, `OrionDesignSystem`):
  - `public enum OrionHatState: Sendable { case working, needsYou }`
  - `public struct OrionHatMark: View { public init(state: OrionHatState, tint: Color, hop: Bool, label: String) }`
  - `public enum OrionHatFrames { public static func image(_ name: String) -> NSImage?; public static let neutralGazeCount = 5 }`

- [ ] **Step 1: Write the export script**

`scripts/mascot/render-hat.tsx` (run with tsx from `apps/web` so React resolves):

```tsx
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OrionTalkingHat } from "../../apps/web/src/ui/orion-talking-hat";

for (const expression of ["neutral", "curious"] as const) {
  const svg = renderToStaticMarkup(
    <OrionTalkingHat appearance="avatar" expression={expression} decorative width={96} height={96} />,
  );
  process.stdout.write(`${expression}\t${svg.replace(/\n/g, " ")}\n`);
}
```

`scripts/mascot/export-hat-frames.mjs`:

```js
// Renders the Orion hat avatar to transparent PNGs for the Mac app.
// Run: node scripts/mascot/export-hat-frames.mjs   (needs `pnpm exec playwright install chromium` once)
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const out = join(root, "packages/orion-design-system/Sources/OrionDesignSystem/Resources/Mascot");
mkdirSync(out, { recursive: true });

const lines = execFileSync(
  join(root, "node_modules/.bin/tsx"),
  [join(root, "scripts/mascot/render-hat.tsx")],
  { cwd: join(root, "apps/web"), env: { ...process.env, NODE_PATH: join(root, "apps/web/node_modules") } },
).toString().trim().split("\n");
const svgs = Object.fromEntries(lines.map((line) => line.split("\t")));

// Gaze offsets in SVG units, matching the web sway (-5 → +6).
const GAZE = [-5, -2.5, 0, 3, 6];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 3, viewport: { width: 96, height: 96 } });
async function shot(svg, gaze, file) {
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}[data-part="look"]{transform:translate(${gaze}px,0)}</style>${svg}`,
  );
  await page.locator("svg").screenshot({ path: join(out, file), omitBackground: true });
}
for (const [index, gaze] of GAZE.entries()) await shot(svgs.neutral, gaze, `hat-neutral-${index}.png`);
await shot(svgs.curious, 0, "hat-curious.png");
await browser.close();
console.log(`Wrote ${GAZE.length + 1} frames to ${out}`);
```

- [ ] **Step 2: Run the export and inspect the frames**

Run: `node scripts/mascot/export-hat-frames.mjs`
Expected: "Wrote 6 frames to …/Resources/Mascot". Open `hat-neutral-0.png` and `hat-neutral-4.png` with the Read tool. Check that they are 288×288, the background is transparent, the hat is brown (untinted), and the eyes are looking left and right respectively.

- [ ] **Step 3: Write the failing Swift test**

`OrionHatMarkTests.swift` (match the test framework the target already uses):

```swift
import Testing
@testable import OrionDesignSystem

@Test func hatFramesShipInTheBundle() {
    for index in 0..<OrionHatFrames.neutralGazeCount {
        #expect(OrionHatFrames.image("hat-neutral-\(index)") != nil)
    }
    #expect(OrionHatFrames.image("hat-curious") != nil)
}

@Test func gazeFrameFollowsTheSway() {
    #expect(OrionHatMark.gazeIndex(phase: 0) == 0)
    #expect(OrionHatMark.gazeIndex(phase: 0.5) == OrionHatFrames.neutralGazeCount - 1)
    #expect(OrionHatMark.gazeIndex(phase: 1) == 0)
}
```

- [ ] **Step 4: Run it to verify it fails**

Run: `cd packages/orion-design-system && swift test --filter OrionHatMarkTests`
Expected: FAIL (types not found).

- [ ] **Step 5: Implement**

`Components/OrionHatMark.swift`:

```swift
import AppKit
import SwiftUI

public enum OrionHatState: Sendable { case working, needsYou }

/// PNG frames rendered from the web mascot by scripts/mascot/export-hat-frames.mjs.
public enum OrionHatFrames {
    public static let neutralGazeCount = 5

    public static func image(_ name: String) -> NSImage? {
        guard let url = ResourceBundle.current.url(forResource: name, withExtension: "png", subdirectory: "Mascot")
            ?? ResourceBundle.current.url(forResource: name, withExtension: "png") else { return nil }
        return NSImage(contentsOf: url)
    }
}

/// A project's status as the Orion hat, tinted with the project's colour.
/// Working: the tip sways and the eyes follow. Needs you: curious face, and
/// in the sidebar a springy hop every 6 seconds.
public struct OrionHatMark: View {
    let state: OrionHatState
    let tint: Color
    let hop: Bool
    let label: String

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(state: OrionHatState, tint: Color, hop: Bool, label: String) {
        self.state = state
        self.tint = tint
        self.hop = hop
        self.label = label
    }

    /// 0…1 sway phase → gaze frame (0 = far left, last = far right, back again).
    static func gazeIndex(phase: Double) -> Int {
        let wave = 0.5 - 0.5 * cos(phase * 2 * .pi)          // 0 → 1 → 0
        return Int((wave * Double(OrionHatFrames.neutralGazeCount - 1)).rounded())
    }

    public var body: some View {
        TimelineView(.animation(paused: reduceMotion)) { context in
            let t = context.date.timeIntervalSinceReferenceDate
            frame(at: t)
        }
        .accessibilityElement()
        .accessibilityLabel(label)
        .help(label)
    }

    @ViewBuilder private func frame(at t: TimeInterval) -> some View {
        switch state {
        case .working:
            let phase = reduceMotion ? 0.25 : (t / 2.8).truncatingRemainder(dividingBy: 1)
            let skew = reduceMotion ? 0 : (5 - 11 * (0.5 - 0.5 * cos(phase * 2 * .pi))) * .pi / 180
            tinted("hat-neutral-\(Self.gazeIndex(phase: phase))")
                .transformEffect(CGAffineTransform(a: 1, b: 0, c: CGFloat(tan(skew)), d: 1, tx: 0, ty: 0))
        case .needsYou:
            let (lift, sx, sy) = hop && !reduceMotion ? Self.hopPose((t / 6).truncatingRemainder(dividingBy: 1)) : (0, 1, 1)
            tinted("hat-curious")
                .scaleEffect(x: sx, y: sy, anchor: .bottom)
                .offset(y: -lift)
        }
    }

    /// Matches the web keyframes: squash 2%, leap 5% (38% of height), land 8%, rest from 10%.
    static func hopPose(_ p: Double) -> (lift: CGFloat, sx: CGFloat, sy: CGFloat) {
        func mix(_ a: Double, _ b: Double, _ f: Double) -> Double { a + (b - a) * f }
        switch p {
        case ..<0.02: let f = p / 0.02; return (0, mix(1, 1.12, f), mix(1, 0.86, f))
        case ..<0.05: let f = (p - 0.02) / 0.03; return (CGFloat(mix(0, 0.38, f)) * 22, mix(1.12, 0.94, f), mix(0.86, 1.08, f))
        case ..<0.08: let f = (p - 0.05) / 0.03; return (CGFloat(mix(0.38, 0, f)) * 22, mix(0.94, 1.1, f), mix(1.08, 0.9, f))
        case ..<0.10: let f = (p - 0.08) / 0.02; return (0, mix(1.1, 1, f), mix(0.9, 1, f))
        default: return (0, 1, 1)
        }
    }

    private func tinted(_ name: String) -> some View {
        let image = OrionHatFrames.image(name).map { Image(nsImage: $0).resizable().scaledToFit() }
        return ZStack {
            image
            tint.blendMode(.color).mask { image }
        }
        .compositingGroup()
    }
}
```

The `22` in `hopPose` is the 22 pt sidebar mark size. It makes the hop lift equal 38% of the hat's height. If `ResourceBundle` is `internal` (it is, inside the same module), the code compiles as is. If `.process("Resources")` flattens subdirectories, the fallback `url(forResource:withExtension:)` without `subdirectory` finds the PNGs.

- [ ] **Step 6: Run tests**

Run: `cd packages/orion-design-system && swift test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/mascot packages/orion-design-system/Sources/OrionDesignSystem/Resources/Mascot packages/orion-design-system/Sources/OrionDesignSystem/Components/OrionHatMark.swift packages/orion-design-system/Tests/OrionDesignSystemTests/OrionHatMarkTests.swift
git commit -m "feat(design-system): add the native Orion status hat and its exported frames"
```

---

### Task 11: Native sidebar and tabs

**Files:**
- Modify: `apps/mac/Sources/Orion/Frame/FrameSidebar.swift`, `apps/mac/Sources/Orion/Frame/ProjectTabBar.swift`, `apps/mac/Tests/OrionTests/FrameModelTests.swift` (only if `FrameModel` exposes snapshot data the views read)

**Interfaces:**
- Consumes: `FrameSnapshot.projectActivity` / `.tabActivity` (Task 9), `OrionHatMark` / `OrionHatState` (Task 10), `ProjectStyle.color(_:)`.

- [ ] **Step 1: Write the failing test**

In `FrameModelTests.swift`, add a test that sends a snapshot with `projectActivity["p1"] = .init(id: "p1", state: .needsYou, label: "Mark needs you · Write the PRD?")` through the model, the same way existing tests feed snapshots. Assert that the model's current snapshot exposes it, for example `#expect(model.snapshot?.projectActivity["p1"]?.state == .needsYou)` (use the model's actual property name). If the model just stores the decoded snapshot unchanged, Task 9's decode tests already cover this. In that case skip this step and note that in the commit message.

- [ ] **Step 2: Sidebar**

In `FrameSidebar.swift`:
- Change `row("Home", .house, .home)` to `row("Overview", .house, .home)`, and update the file's header comment.
- In `projectRow(_:)`, replace `ProjectMark(project: project, revision: logoRevision)` with:

```swift
if let activity = frame.snapshot?.projectActivity[project.id] {
    OrionHatMark(
        state: activity.state == .working ? .working : .needsYou,
        tint: ProjectStyle.color(project.color),
        hop: true,
        label: activity.label
    )
} else {
    ProjectMark(project: project, revision: logoRevision)
}
```

(`frame.snapshot` stands for however `FrameSidebar` currently reaches the `FrameSnapshot`. Use the same accessor it already uses for `frame.destination`, adding a passthrough on the model if needed.)

- [ ] **Step 3: Tabs**

In `ProjectTabBar.swift`, pass an optional `activity: FrameActivity?` into `ChatTab`, from `frame.snapshot?.tabActivity[tab.id]`. In `ChatTab`'s label, before the title text:

```swift
if let activity {
    OrionHatMark(
        state: activity.state == .working ? .working : .needsYou,
        tint: ProjectStyle.color(projectColor),
        hop: false,
        label: activity.label
    )
    .frame(width: 16, height: 16)
}
```

Pass `projectColor` from the selected project's `color` key, the same project the tab bar already reads for its title.

- [ ] **Step 4: Build, test, preview**

Run: `cd apps/mac && swift build && swift test`
Expected: PASS.
Then run `apps/mac/scripts/preview.sh` and visually confirm, with a local web dev server and a running screen generation:
- The busy project's sidebar mark is a swaying hat in its colour.
- When the generation completes, the hat turns curious and hops every ~6s, and hovering shows the label.
- The tab shows the hat without hopping.
- Opening the tab returns the mark to the logo within ~5s.
- With System Settings › Accessibility › Display › Reduce motion on, nothing animates.

Save a screenshot to `.context/` for the acceptance record.

- [ ] **Step 5: Commit**

```bash
git add apps/mac/Sources/Orion/Frame apps/mac/Tests/OrionTests
git commit -m "feat(mac): show working and needs-you hats in the native sidebar and tabs"
```

---

### Task 12: End-to-end acceptance

- [ ] **Step 1: Full suites**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:db && (cd apps/mac && swift test) && (cd packages/orion-design-system && swift test)`
Expected: all PASS.

- [ ] **Step 2: Browser walkthrough**

Start the web app locally. Then:
1. Overview shows the greeting and counts, "Needs you", and "All projects".
2. Start a reply in project A while viewing project B. A's sidebar hat sways, and the All projects row says "Working on {tab}…".
3. When the reply completes, A's hat turns curious and hops, the tooltip says "A needs you · Orion replied", and Overview lists it with **Review**.
4. Open the tab. Within ~5s the mark returns to the logo and the item leaves Overview.
5. Use DevTools to emulate `prefers-reduced-motion: reduce`. The hats show without moving.

Save screenshots to `.context/`.

- [ ] **Step 3: Record acceptance**

Append a short "Acceptance 2026-11-xx" section to the spec, listing the results of steps 1–2 and the screenshot paths. Then commit:

```bash
git add docs/superpowers/specs/2026-11-09-orion-overview-and-working-hats-design.md
git commit -m "docs: record Overview and working-hats acceptance"
```
