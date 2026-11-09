# Orion Morning To-dos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every morning at 6:00 owner-local, a Cloudflare Worker cron reads each changed project, asks DeepSeek for up to 5 to-dos, and appends them to a now-persisted Overview Todo (Mac + web). The Todo → In progress → Completed lists are all saved. "Needs you" is removed.

**Architecture:** One Supabase migration adds `todo_items`, `project_briefs`, `morning_runs`, a `time_zone` column, and `security definer` functions (owner-facing and service-role). Pure TypeScript modules in `apps/gateway/src/morning-todos/` do the time-window check, fact truncation, dedupe, the DeepSeek call and the run loop. The Worker's `scheduled()` calls them hourly. The web gets a `features/todos` reader/writer, server actions and a Todo section. The Mac app reads to-dos from the frame snapshot and writes through new page handlers.

**Tech Stack:** Postgres/pgTAP (Supabase CLI 2.109.1), TypeScript + zod 4 + vitest, Cloudflare Workers (wrangler 4), Next.js server actions + Astryx, SwiftUI + Swift Testing.

**Spec:** `docs/superpowers/specs/2026-11-09-orion-morning-todos-design.md` (read Part A first).

**Revision 2026-11-09 (after Task 1 was built):** the Mac Overview gained In progress and Completed lists. Task 1b converts the database to stages; Tasks 2 and 7–10 were rewritten for stages. Tasks 3–6 are unchanged.

## Global Constraints

- Run time: owner-local hour 6, 7, 8 or 9 only; at most one successful run per workspace per local date.
- Fallback time zone: `Europe/London`.
- Caps: 10 projects per run, ~6,000 words of facts per project, 5 to-dos per project, 1 DeepSeek call per project, no retries on bad output.
- DeepSeek: endpoint `https://api.deepseek.com/chat/completions`, model from `DEEPSEEK_TEXT_MODEL`, default `deepseek-flash`, `temperature: 0.2`, `response_format: { type: "json_object" }`, 30 s timeout.
- To-do text: 1–500 characters after trimming. Orion's prompt asks for under 120.
- Brief summary: at most 4,000 characters stored.
- No visible "by Orion" marker anywhere in the UI.
- Logs never include message text, to-do text or summaries (the GitHub repo is public). Log ids and error codes only.
- Web UI: Astryx components only, no raw `<div>`/`<span>` layout, tokens only, no hex/px (see `AGENTS.md`). Run `pnpm check:astryx` after web UI changes.
- Swift: follow `.claude/skills/swiftui-pro`.
- Node v22.23.2: `export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"`.
- Supabase CLI 2.109.1 first on PATH: `export PATH="$HOME/.local/share/supabase:$PATH"`. Check `which supabase` before any DB command. Never run `supabase db reset` against the shared dev DB.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- This branch has unrelated uncommitted work (Mac Overview, etc.). Only `git add` the exact files named in each task.

---

## File Structure

**Database**
- Create `supabase/migrations/20261109000002_morning_todos.sql`: tables, column, all functions (Task 1, built).
- Create `supabase/migrations/20261109000003_todo_stages.sql`: stages replace `handled_at` (Task 1b).
- Create `supabase/tests/morning_todos.test.sql`: pgTAP.

**Shared contract**
- Create `packages/contracts/src/todos.ts`: `TodoItemSchema`, `MorningTodosOutputSchema`, `normalizeTodoText`.
- Create `packages/contracts/src/todos.test.ts`.
- Modify `packages/contracts/src/index.ts`: re-export.

**Gateway (runtime-neutral, used by the Worker)**
- Create `apps/gateway/src/morning-todos/clock.ts` (+ `.test.ts`): local date/hour, run window.
- Create `apps/gateway/src/morning-todos/facts.ts` (+ `.test.ts`): fact types, truncation, filter.
- Create `apps/gateway/src/morning-todos/deepseek-todo-writer.ts` (+ `.test.ts`): prompt + call.
- Create `apps/gateway/src/morning-todos/run-morning-todos.ts` (+ `.test.ts`): repository + orchestrator.
- Modify `apps/gateway/src/core.ts`: exports.
- Create `apps/gateway/scripts/run-morning-todos.ts`: manual acceptance runner.

**Worker**
- Modify `apps/gateway-worker/src/env.ts`, `src/index.ts`, `wrangler.jsonc`.
- Create `apps/gateway-worker/src/scheduled.ts` (+ `.test.ts`): the hourly handler body.

**Web**
- Create `apps/web/src/features/todos/todo-store.ts` (+ `.test.ts`): RPC reader/writer.
- Create `apps/web/src/features/todos/actions.ts` (+ `.test.ts`): server actions.
- Create `apps/web/src/features/todos/components/todo-section.tsx` (+ `.test.tsx`): Todo, In progress, Completed.
- Modify `apps/web/src/app/(app)/[workspaceId]/page.tsx` (+ `page.test.tsx`).
- Delete `apps/web/src/features/activity/components/needs-you-list.tsx` + test.
- Modify `apps/web/src/features/native/bridge.ts`, `native-frame-bridge.tsx` (+ test), `apps/web/src/app/(app)/[workspaceId]/layout.tsx`.

**Mac**
- Modify `apps/mac/Sources/OrionAppCore/Frame/FrameSnapshot.swift`: `FrameTodo`, decode.
- Modify `apps/mac/Tests/OrionAppCoreTests/FrameTests.swift`.
- Modify `apps/mac/Sources/Orion/Frame/FrameModel.swift`: todo + time zone commands.
- Modify `apps/mac/Sources/Orion/Frame/OverviewTodoStore.swift`, `OverviewPage.swift`.
- Modify `apps/mac/Tests/OrionTests/OverviewTodoStoreTests.swift`.

---

### Task 1: Database: tables and functions ✅ built (commit 2c62f8d)

**Files:**
- Create: `supabase/migrations/20261109000002_morning_todos.sql`
- Test: `supabase/tests/morning_todos.test.sql`

**Interfaces:**
- Produces (owner, `authenticated`):
  - `list_todo_items(target_workspace_id uuid) → table(id uuid, project_id uuid, text text, position double precision, created_at timestamptz)`, open lines only, ordered by position.
  - `save_todo_item(target_workspace_id uuid, item_id uuid, item_text text, item_project_id uuid, item_position double precision) → void`: insert or update an open line.
  - `remove_todo_items(target_workspace_id uuid, item_ids uuid[], removal text) → void`, where `removal` is `'deleted'` or `'handled'`.
  - `set_my_time_zone(zone text) → void`.
- Produces (`service_role` only):
  - `list_morning_workspaces() → table(workspace_id uuid, owner_user_id uuid, time_zone text)`
  - `claim_morning_run(target_workspace_id uuid, target_local_date date) → boolean`
  - `morning_todo_facts(target_workspace_id uuid, target_user_id uuid, max_projects integer) → table(project_id uuid, project_name text, summary text, since timestamptz, activity_count integer, facts jsonb)`
  - `save_morning_todos(target_workspace_id uuid, target_project_id uuid, new_summary text, todo_texts text[], read_until timestamptz) → integer` (lines inserted)
  - `finish_morning_run(target_workspace_id uuid, target_local_date date, run_status text, read_count integer, added_count integer) → void`
- `facts` JSON keys: `messages[{room,from,text,at}]` (`from` is `"you"` or `"orion"`), `decisions[{room,summary,at}]`, `prds[{room,version,status,at}]`, `screens[{room,name,state,at}]`, `tasks[{room,kind,status,at}]`, `open_todos string[]`, `known_todos string[]`.

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/morning_todos.test.sql`:

```sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(22);

-- Fixtures: owner + outsider, one workspace, two projects, one room each.
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('b1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'todo-owner@example.com', '', now(), '{}', '{}', now(), now()),
  ('b1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'todo-outsider@example.com', '', now(), '{}', '{}', now(), now());

insert into public.workspaces (id, name, created_by)
values ('b2000000-0000-4000-8000-000000000001', 'Todo workspace',
        'b1000000-0000-4000-8000-000000000001');

insert into public.projects (id, workspace_id, name, created_by)
values
  ('b7000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001',
   'Busy project', 'b1000000-0000-4000-8000-000000000001'),
  ('b7000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001',
   'Quiet project', 'b1000000-0000-4000-8000-000000000001');

insert into public.rooms (id, workspace_id, project_id, name, owner_id)
values
  ('b4000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001',
   'b7000000-0000-4000-8000-000000000001', 'Main', 'b1000000-0000-4000-8000-000000000001'),
  ('b4000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001',
   'b7000000-0000-4000-8000-000000000002', 'Main', 'b1000000-0000-4000-8000-000000000001');

insert into public.messages (id, room_id, client_id, author_type, author_id, body, created_at)
values ('b6000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001',
        'b6100000-0000-4000-8000-000000000001', 'human',
        'b1000000-0000-4000-8000-000000000001', 'We still need a pricing page.',
        now() - interval '1 hour');

-- The quiet project was read after its only (old) activity.
insert into public.messages (id, room_id, client_id, author_type, author_id, body, created_at)
values ('b6000000-0000-4000-8000-000000000002', 'b4000000-0000-4000-8000-000000000002',
        'b6100000-0000-4000-8000-000000000002', 'human',
        'b1000000-0000-4000-8000-000000000001', 'Old note.', now() - interval '3 days');
insert into public.project_briefs (project_id, workspace_id, summary, last_read_at)
values ('b7000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001',
        'Quiet so far.', now() - interval '1 day');

-- Privileges
select ok(not has_function_privilege('anon', 'public.list_todo_items(uuid)', 'EXECUTE'),
  'anon cannot list to-dos');
select ok(has_function_privilege('authenticated', 'public.save_todo_item(uuid,uuid,text,uuid,double precision)', 'EXECUTE'),
  'signed-in people can save to-dos');
select ok(not has_function_privilege('authenticated', 'public.morning_todo_facts(uuid,uuid,integer)', 'EXECUTE'),
  'signed-in people cannot read morning facts');
select ok(not has_function_privilege('authenticated', 'public.save_morning_todos(uuid,uuid,text,text[],timestamptz)', 'EXECUTE'),
  'signed-in people cannot write morning to-dos');
select ok(not has_table_privilege('authenticated', 'public.todo_items', 'SELECT'),
  'the to-do table is closed to direct reads');

-- Owner flow
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);

select lives_ok($$ select public.save_todo_item(
  'b2000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001',
  '  Write the launch email  ', 'b7000000-0000-4000-8000-000000000001', 1) $$,
  'the owner saves a line');
select is((select text from public.list_todo_items('b2000000-0000-4000-8000-000000000001')),
  'Write the launch email', 'saved text is trimmed');
select lives_ok($$ select public.save_todo_item(
  'b2000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001',
  'Write the launch email today', null, 1) $$,
  'the owner edits the line and clears its project');
select is((select project_id from public.list_todo_items('b2000000-0000-4000-8000-000000000001')),
  null::uuid, 'the project was cleared');
select lives_ok($$ select public.save_todo_item(
  'b2000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000002',
  'Pick a pricing tier', 'b7000000-0000-4000-8000-000000000001', 2) $$,
  'the owner saves a second line');
select lives_ok($$ select public.remove_todo_items(
  'b2000000-0000-4000-8000-000000000001',
  array['b8000000-0000-4000-8000-000000000002']::uuid[], 'deleted') $$,
  'the owner deletes a line');
select is((select count(*)::int from public.list_todo_items('b2000000-0000-4000-8000-000000000001')),
  1, 'deleted lines leave the list');
select throws_ok($$ select public.remove_todo_items(
  'b2000000-0000-4000-8000-000000000001', array[]::uuid[], 'archived') $$,
  '22023', null, 'unknown removal kinds are refused');
select lives_ok($$ select public.set_my_time_zone('Africa/Lagos') $$, 'the owner sets a time zone');
select throws_ok($$ select public.set_my_time_zone('Mars/Olympus') $$,
  '22023', null, 'unknown time zones are refused');

-- Outsider
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000002', true);
select throws_ok($$ select * from public.list_todo_items('b2000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'outsiders cannot list the owner''s to-dos');
reset role;

-- Service flow
select is((select time_zone from public.list_morning_workspaces()
           where workspace_id = 'b2000000-0000-4000-8000-000000000001'),
  'Africa/Lagos', 'the morning job sees the owner''s time zone');
select ok(public.claim_morning_run('b2000000-0000-4000-8000-000000000001', '2026-11-10'),
  'the first claim of the day wins');
select ok(not public.claim_morning_run('b2000000-0000-4000-8000-000000000001', '2026-11-10'),
  'a second claim the same day loses');
select is((select array_agg(project_name) from public.morning_todo_facts(
             'b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 10)),
  array['Busy project'], 'only changed projects come back');
select is((select jsonb_array_length(facts->'known_todos') from public.morning_todo_facts(
             'b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 10)),
  1, 'known to-dos include the deleted line for the project');
select is(public.save_morning_todos(
  'b2000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000001',
  'Pricing is the open thread.', array['Draft the pricing page', '   '], now()),
  1, 'blank to-dos are skipped and the rest are saved');

select * from finish();
rollback;
```

- [ ] **Step 2: Run it and confirm it fails**

Use the branch-pure scratch-DB recipe (memory "Meld local setup", point 15). The short form: clone the dev schema into a scratch DB, drop and recreate `public`, set the postgres default ACLs, create pgtap outside a transaction, then replay every `supabase/migrations/*.sql` in order as `postgres`. Then run:

```bash
docker exec -i supabase_db_meld psql -U postgres -d morning_scratch -v ON_ERROR_STOP=1 < supabase/tests/morning_todos.test.sql
```
Expected: failures such as `function public.list_todo_items(uuid) does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261109000002_morning_todos.sql`:

```sql
-- Orion morning to-dos (docs/superpowers/specs/2026-11-09-orion-morning-todos-design.md).
-- Tables are closed to anon/authenticated; every read and write goes through the
-- functions below (same pattern as room_views).

create table public.todo_items (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid,
  text text not null check (char_length(btrim(text)) between 1 and 500),
  author text not null check (author in ('owner', 'orion')),
  position double precision not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  handled_at timestamptz,
  deleted_at timestamptz,
  foreign key (project_id, workspace_id)
    references public.projects(id, workspace_id) on delete set null (project_id)
);
create index todo_items_open on public.todo_items (workspace_id, position)
  where handled_at is null and deleted_at is null;
create index todo_items_project on public.todo_items (project_id);

create table public.project_briefs (
  project_id uuid primary key references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  summary text not null default '' check (char_length(summary) <= 4000),
  last_read_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table public.morning_runs (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  local_date date not null,
  status text not null check (status in ('running', 'done', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  projects_read integer not null default 0,
  items_added integer not null default 0,
  primary key (workspace_id, local_date)
);

alter table public.ai_user_preferences
  add column time_zone text check (time_zone is null or char_length(time_zone) between 1 and 64);

alter table public.todo_items enable row level security;
alter table public.project_briefs enable row level security;
alter table public.morning_runs enable row level security;
revoke all on table public.todo_items, public.project_briefs, public.morning_runs
  from anon, authenticated;

-- ---------- Owner functions ----------

create function public.list_todo_items(target_workspace_id uuid)
returns table (id uuid, project_id uuid, text text, "position" double precision, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if auth.uid() is null or not public.is_workspace_member(target_workspace_id) then
    raise exception 'Workspace not found.' using errcode = '42501';
  end if;
  return query
    select item.id, item.project_id, item.text, item.position, item.created_at
    from public.todo_items as item
    where item.workspace_id = target_workspace_id
      and item.handled_at is null
      and item.deleted_at is null
    order by item.position, item.created_at;
end;
$$;

create function public.save_todo_item(
  target_workspace_id uuid,
  item_id uuid,
  item_text text,
  item_project_id uuid,
  item_position double precision
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_workspace_member(target_workspace_id) then
    raise exception 'Workspace not found.' using errcode = '42501';
  end if;
  insert into public.todo_items as item (id, workspace_id, project_id, text, author, position)
  values (item_id, target_workspace_id, item_project_id, btrim(item_text), 'owner', item_position)
  on conflict (id) do update
    set text = excluded.text,
        project_id = excluded.project_id,
        position = excluded.position,
        updated_at = now()
    where item.workspace_id = target_workspace_id
      and item.handled_at is null
      and item.deleted_at is null;
end;
$$;

create function public.remove_todo_items(
  target_workspace_id uuid,
  item_ids uuid[],
  removal text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_workspace_member(target_workspace_id) then
    raise exception 'Workspace not found.' using errcode = '42501';
  end if;
  if removal not in ('deleted', 'handled') then
    raise exception 'Unknown removal.' using errcode = '22023';
  end if;
  update public.todo_items
  set deleted_at = case when removal = 'deleted' then now() else deleted_at end,
      handled_at = case when removal = 'handled' then now() else handled_at end,
      updated_at = now()
  where workspace_id = target_workspace_id
    and id = any(item_ids)
    and handled_at is null
    and deleted_at is null;
end;
$$;

create function public.set_my_time_zone(zone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = zone) then
    raise exception 'Unknown time zone.' using errcode = '22023';
  end if;
  insert into public.ai_user_preferences (user_id, time_zone)
  values (auth.uid(), zone)
  on conflict (user_id) do update
    set time_zone = excluded.time_zone, updated_at = now();
end;
$$;

-- ---------- Service functions (the morning job) ----------

create function public.list_morning_workspaces()
returns table (workspace_id uuid, owner_user_id uuid, time_zone text)
language sql
stable
security definer
set search_path = ''
as $$
  select workspace.id, owner.user_id, preference.time_zone
  from public.workspaces as workspace
  join lateral (
    select membership.user_id
    from public.memberships as membership
    where membership.workspace_id = workspace.id
    order by (membership.role = 'admin') desc, membership.created_at
    limit 1
  ) as owner on true
  left join public.ai_user_preferences as preference on preference.user_id = owner.user_id;
$$;

create function public.claim_morning_run(target_workspace_id uuid, target_local_date date)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed boolean;
begin
  insert into public.morning_runs as run (workspace_id, local_date, status, started_at)
  values (target_workspace_id, target_local_date, 'running', now())
  on conflict (workspace_id, local_date) do update
    set status = 'running', started_at = now(), finished_at = null
    where run.status = 'failed'
       or (run.status = 'running' and run.started_at < now() - interval '30 minutes')
  returning true into claimed;
  return coalesce(claimed, false);
end;
$$;

create function public.finish_morning_run(
  target_workspace_id uuid,
  target_local_date date,
  run_status text,
  read_count integer,
  added_count integer
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.morning_runs
  set status = run_status, finished_at = now(),
      projects_read = read_count, items_added = added_count
  where workspace_id = target_workspace_id and local_date = target_local_date;
$$;

create function public.morning_todo_facts(
  target_workspace_id uuid,
  target_user_id uuid,
  max_projects integer
)
returns table (
  project_id uuid,
  project_name text,
  summary text,
  since timestamptz,
  activity_count integer,
  facts jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with project_since as (
    select project.id as project_id, project.name as project_name,
           coalesce(brief.summary, '') as summary,
           coalesce(brief.last_read_at, now() - interval '7 days') as since
    from public.projects as project
    left join public.project_briefs as brief on brief.project_id = project.id
    where project.workspace_id = target_workspace_id
  ),
  room_scope as (
    select room.id as room_id, room.name as room_name, scope.project_id, scope.since
    from public.rooms as room
    join project_since as scope on scope.project_id = room.project_id
    where room.workspace_id = target_workspace_id
  ),
  new_messages as (
    select scope.project_id, msg.created_at as at,
           jsonb_build_object(
             'room', scope.room_name,
             'from', case when msg.author_type = 'product_agent' then 'orion' else 'you' end,
             'text', left(msg.body, 2000),
             'at', msg.created_at) as fact
    from public.messages as msg
    join room_scope as scope on scope.room_id = msg.room_id
    where msg.created_at > scope.since
  ),
  new_decisions as (
    select scope.project_id, decision.created_at as at,
           jsonb_build_object('room', scope.room_name, 'summary', left(decision.summary, 1000),
                              'at', decision.created_at) as fact
    from public.decisions as decision
    join room_scope as scope on scope.room_id = decision.room_id
    where decision.created_at > scope.since
  ),
  new_prds as (
    select scope.project_id, prd.updated_at as at,
           jsonb_build_object('room', scope.room_name, 'version', prd.version,
                              'status', prd.status::text, 'at', prd.updated_at) as fact
    from public.prds as prd
    join room_scope as scope on scope.room_id = prd.room_id
    where prd.updated_at > scope.since
  ),
  new_screens as (
    select scope.project_id, screen.updated_at as at,
           jsonb_build_object('room', scope.room_name, 'name', screen.name,
                              'state', screen.state::text, 'at', screen.updated_at) as fact
    from public.design_screens as screen
    join room_scope as scope on scope.room_id = screen.room_id
    where screen.deleted_at is null and screen.updated_at > scope.since
  ),
  new_tasks as (
    select scope.project_id, task.updated_at as at,
           jsonb_build_object('room', scope.room_name, 'kind', task.kind::text,
                              'status', task.status::text, 'at', task.updated_at) as fact
    from public.ai_tasks as task
    join room_scope as scope on scope.room_id = task.room_id
    left join public.room_views as view
      on view.room_id = task.room_id and view.user_id = target_user_id
    where task.updated_at > scope.since
      and (
        task.status in ('failed', 'needs_reauthentication', 'usage_limit_reached', 'needs_review')
        or (task.status = 'completed'
            and (view.last_viewed_at is null or view.last_viewed_at < task.updated_at))
      )
  ),
  activity as (
    select project_id, count(*)::integer as n
    from (
      select project_id from new_messages
      union all select project_id from new_decisions
      union all select project_id from new_prds
      union all select project_id from new_screens
      union all select project_id from new_tasks
    ) as everything
    group by project_id
  )
  select scope.project_id, scope.project_name, scope.summary, scope.since, activity.n,
    jsonb_build_object(
      'messages', coalesce((
        select jsonb_agg(latest.fact order by latest.at desc)
        from (select fact, at from new_messages
              where new_messages.project_id = scope.project_id
              order by at desc limit 60) as latest), '[]'::jsonb),
      'decisions', coalesce((select jsonb_agg(fact order by at desc) from new_decisions
                             where new_decisions.project_id = scope.project_id), '[]'::jsonb),
      'prds', coalesce((select jsonb_agg(fact order by at desc) from new_prds
                        where new_prds.project_id = scope.project_id), '[]'::jsonb),
      'screens', coalesce((select jsonb_agg(fact order by at desc) from new_screens
                           where new_screens.project_id = scope.project_id), '[]'::jsonb),
      'tasks', coalesce((select jsonb_agg(fact order by at desc) from new_tasks
                         where new_tasks.project_id = scope.project_id), '[]'::jsonb),
      'open_todos', coalesce((
        select jsonb_agg(item.text order by item.position)
        from public.todo_items as item
        where item.workspace_id = target_workspace_id
          and item.project_id = scope.project_id
          and item.handled_at is null and item.deleted_at is null), '[]'::jsonb),
      'known_todos', coalesce((
        select jsonb_agg(item.text)
        from public.todo_items as item
        where item.workspace_id = target_workspace_id
          and item.project_id = scope.project_id), '[]'::jsonb)
    )
  from project_since as scope
  join activity on activity.project_id = scope.project_id
  order by activity.n desc, scope.project_id
  limit greatest(max_projects, 0);
$$;

create function public.save_morning_todos(
  target_workspace_id uuid,
  target_project_id uuid,
  new_summary text,
  todo_texts text[],
  read_until timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  start_position double precision;
  inserted integer;
begin
  if not exists (
    select 1 from public.projects
    where id = target_project_id and workspace_id = target_workspace_id
  ) then
    raise exception 'Project not found.' using errcode = 'P0002';
  end if;

  select coalesce(max(item.position), 0) into start_position
  from public.todo_items as item
  where item.workspace_id = target_workspace_id;

  insert into public.todo_items (id, workspace_id, project_id, text, author, position)
  select gen_random_uuid(), target_workspace_id, target_project_id,
         btrim(entry.value), 'orion', start_position + entry.ordinality
  from unnest(todo_texts) with ordinality as entry(value, ordinality)
  where char_length(btrim(entry.value)) between 1 and 500;
  get diagnostics inserted = row_count;

  insert into public.project_briefs (project_id, workspace_id, summary, last_read_at, updated_at)
  values (target_project_id, target_workspace_id, left(coalesce(new_summary, ''), 4000), read_until, now())
  on conflict (project_id) do update
    set summary = excluded.summary, last_read_at = excluded.last_read_at, updated_at = now();

  return inserted;
end;
$$;

-- ---------- Grants ----------

revoke all on function
  public.list_todo_items(uuid),
  public.save_todo_item(uuid, uuid, text, uuid, double precision),
  public.remove_todo_items(uuid, uuid[], text),
  public.set_my_time_zone(text),
  public.list_morning_workspaces(),
  public.claim_morning_run(uuid, date),
  public.finish_morning_run(uuid, date, text, integer, integer),
  public.morning_todo_facts(uuid, uuid, integer),
  public.save_morning_todos(uuid, uuid, text, text[], timestamptz)
from public, anon, authenticated;

grant execute on function
  public.list_todo_items(uuid),
  public.save_todo_item(uuid, uuid, text, uuid, double precision),
  public.remove_todo_items(uuid, uuid[], text),
  public.set_my_time_zone(text)
to authenticated;

grant execute on function
  public.list_morning_workspaces(),
  public.claim_morning_run(uuid, date),
  public.finish_morning_run(uuid, date, text, integer, integer),
  public.morning_todo_facts(uuid, uuid, integer),
  public.save_morning_todos(uuid, uuid, text, text[], timestamptz)
to service_role;
```

Note: if `public.memberships` has no `created_at` after the rename, order by `membership.user_id` instead. Check with `\d public.memberships` in the scratch DB.

- [ ] **Step 4: Replay the new migration in the scratch DB and run the test**

```bash
docker exec -i supabase_db_meld psql -U postgres -d morning_scratch -v ON_ERROR_STOP=1 < supabase/migrations/20261109000002_morning_todos.sql
docker exec -i supabase_db_meld psql -U postgres -d morning_scratch -v ON_ERROR_STOP=1 < supabase/tests/morning_todos.test.sql
```
Expected: `ok 1` … `ok 22`, no `not ok`.

- [ ] **Step 5: Run the repo's SQL checks**

```bash
pnpm test:sql
```
Expected: PASS. If `check:sql-rooms` or `check:sql-arities` flags something, fix the migration to satisfy it rather than changing the check.

- [ ] **Step 6: Apply to the shared local dev DB without wiping it**

```bash
which supabase   # must be ~/.local/share/supabase/supabase
supabase migration up --local
```

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261109000002_morning_todos.sql supabase/tests/morning_todos.test.sql
git commit -m "feat(db): saved Overview to-dos and the morning to-do job functions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1b: Database: Todo → In progress → Completed stages

Added after Task 1 was built. The Mac Overview now has three lists, so each line needs a stage instead of `handled_at`. Task 1's migration is committed and may be applied to the local dev DB, so **don't edit it**. Add a follow-up migration.

**Files:**
- Create: `supabase/migrations/20261109000003_todo_stages.sql`
- Modify: `supabase/tests/morning_todos.test.sql`

**Interfaces:**
- Changes (owner, `authenticated`):
  - `list_todo_items(target_workspace_id uuid) → table(id uuid, project_id uuid, text text, stage text, position double precision, created_at timestamptz, stage_changed_at timestamptz)`: every non-deleted `todo` and `in_progress` line plus the 50 most recent `done` lines, ordered by position.
  - `save_todo_item(...)`: same signature; it only updates lines whose stage is `todo`.
  - **Removed:** `remove_todo_items`.
  - **New:** `set_todo_stage(target_workspace_id uuid, item_ids uuid[], new_stage text) → void`, where `new_stage` is `'todo'`, `'in_progress'` or `'done'`.
  - **New:** `delete_todo_items(target_workspace_id uuid, item_ids uuid[]) → void` (soft delete).
- Changes (service): `morning_todo_facts` → `facts.open_todos` now means the project's `todo` + `in_progress` lines. `known_todos` is unchanged (every line, any stage, including deleted).

- [ ] **Step 1: Update the pgTAP test (it becomes the failing test)**

Replace `supabase/tests/morning_todos.test.sql` with:

```sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(25);

-- Fixtures: owner + outsider, one workspace, two projects, one room each.
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('b1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'todo-owner@example.com', '', now(), '{}', '{}', now(), now()),
  ('b1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'todo-outsider@example.com', '', now(), '{}', '{}', now(), now());

insert into public.workspaces (id, name, created_by)
values ('b2000000-0000-4000-8000-000000000001', 'Todo workspace',
        'b1000000-0000-4000-8000-000000000001');

insert into public.projects (id, workspace_id, name, created_by)
values
  ('b7000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001',
   'Busy project', 'b1000000-0000-4000-8000-000000000001'),
  ('b7000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001',
   'Quiet project', 'b1000000-0000-4000-8000-000000000001');

insert into public.rooms (id, workspace_id, project_id, name, owner_id)
values
  ('b4000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001',
   'b7000000-0000-4000-8000-000000000001', 'Main', 'b1000000-0000-4000-8000-000000000001'),
  ('b4000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001',
   'b7000000-0000-4000-8000-000000000002', 'Main', 'b1000000-0000-4000-8000-000000000001');

insert into public.messages (id, room_id, client_id, author_type, author_id, body, created_at)
values ('b6000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001',
        'b6100000-0000-4000-8000-000000000001', 'human',
        'b1000000-0000-4000-8000-000000000001', 'We still need a pricing page.',
        now() - interval '1 hour');

-- The quiet project was read after its only (old) activity.
insert into public.messages (id, room_id, client_id, author_type, author_id, body, created_at)
values ('b6000000-0000-4000-8000-000000000002', 'b4000000-0000-4000-8000-000000000002',
        'b6100000-0000-4000-8000-000000000002', 'human',
        'b1000000-0000-4000-8000-000000000001', 'Old note.', now() - interval '3 days');
insert into public.project_briefs (project_id, workspace_id, summary, last_read_at)
values ('b7000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001',
        'Quiet so far.', now() - interval '1 day');

-- Privileges
select ok(not has_function_privilege('anon', 'public.list_todo_items(uuid)', 'EXECUTE'),
  'anon cannot list to-dos');
select ok(has_function_privilege('authenticated', 'public.save_todo_item(uuid,uuid,text,uuid,double precision)', 'EXECUTE'),
  'signed-in people can save to-dos');
select ok(not has_function_privilege('authenticated', 'public.morning_todo_facts(uuid,uuid,integer)', 'EXECUTE'),
  'signed-in people cannot read morning facts');
select ok(not has_function_privilege('authenticated', 'public.save_morning_todos(uuid,uuid,text,text[],timestamptz)', 'EXECUTE'),
  'signed-in people cannot write morning to-dos');
select ok(not has_table_privilege('authenticated', 'public.todo_items', 'SELECT'),
  'the to-do table is closed to direct reads');

-- Owner flow
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);

select lives_ok($$ select public.save_todo_item(
  'b2000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001',
  '  Write the launch email  ', 'b7000000-0000-4000-8000-000000000001', 1) $$,
  'the owner saves a line');
select is((select text from public.list_todo_items('b2000000-0000-4000-8000-000000000001')),
  'Write the launch email', 'saved text is trimmed');
select lives_ok($$ select public.save_todo_item(
  'b2000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001',
  'Write the launch email today', null, 1) $$,
  'the owner edits the line and clears its project');
select is((select project_id from public.list_todo_items('b2000000-0000-4000-8000-000000000001')),
  null::uuid, 'the project was cleared');
select lives_ok($$ select public.save_todo_item(
  'b2000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000002',
  'Pick a pricing tier', 'b7000000-0000-4000-8000-000000000001', 2) $$,
  'the owner saves a second line');
select lives_ok($$ select public.delete_todo_items(
  'b2000000-0000-4000-8000-000000000001',
  array['b8000000-0000-4000-8000-000000000002']::uuid[]) $$,
  'the owner deletes a line');
select is((select count(*)::int from public.list_todo_items('b2000000-0000-4000-8000-000000000001')),
  1, 'deleted lines leave the list');
select lives_ok($$ select public.set_todo_stage(
  'b2000000-0000-4000-8000-000000000001',
  array['b8000000-0000-4000-8000-000000000001']::uuid[], 'in_progress') $$,
  'Orchestrate moves a line to in progress');
select is((select stage from public.list_todo_items('b2000000-0000-4000-8000-000000000001')),
  'in_progress', 'the line is in progress');
select lives_ok($$ select public.save_todo_item(
  'b2000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001',
  'Edited after orchestrating', null, 1) $$,
  'saving an in-progress line does not fail');
select is((select text from public.list_todo_items('b2000000-0000-4000-8000-000000000001')),
  'Write the launch email today', 'in-progress lines are not edited');
select throws_ok($$ select public.set_todo_stage(
  'b2000000-0000-4000-8000-000000000001', array[]::uuid[], 'archived') $$,
  '22023', null, 'unknown stages are refused');
select lives_ok($$ select public.set_my_time_zone('Africa/Lagos') $$, 'the owner sets a time zone');
select throws_ok($$ select public.set_my_time_zone('Mars/Olympus') $$,
  '22023', null, 'unknown time zones are refused');

-- Outsider
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000002', true);
select throws_ok($$ select * from public.list_todo_items('b2000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'outsiders cannot list the owner''s to-dos');
reset role;

-- Service flow
select is((select time_zone from public.list_morning_workspaces()
           where workspace_id = 'b2000000-0000-4000-8000-000000000001'),
  'Africa/Lagos', 'the morning job sees the owner''s time zone');
select ok(public.claim_morning_run('b2000000-0000-4000-8000-000000000001', '2026-11-10'),
  'the first claim of the day wins');
select ok(not public.claim_morning_run('b2000000-0000-4000-8000-000000000001', '2026-11-10'),
  'a second claim the same day loses');
select is((select array_agg(project_name) from public.morning_todo_facts(
             'b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 10)),
  array['Busy project'], 'only changed projects come back');
select is((select jsonb_array_length(facts->'known_todos') from public.morning_todo_facts(
             'b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 10)),
  1, 'known to-dos include the deleted line for the project');
select is(public.save_morning_todos(
  'b2000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000001',
  'Pricing is the open thread.', array['Draft the pricing page', '   '], now()),
  1, 'blank to-dos are skipped and the rest are saved');

select * from finish();
rollback;
```

- [ ] **Step 2: Run it against the scratch DB (with Task 1 applied) and confirm it fails**

```bash
docker exec -i supabase_db_meld psql -U postgres -d morning_scratch -v ON_ERROR_STOP=1 < supabase/tests/morning_todos.test.sql
```
Expected: failures on `delete_todo_items` / `set_todo_stage` not existing.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261109000003_todo_stages.sql`:

```sql
-- Todo → In progress → Completed (spec revised 2026-11-09): each line gets a
-- stage instead of handled_at. Any handled line becomes done.

alter table public.todo_items
  add column stage text not null default 'todo' check (stage in ('todo', 'in_progress', 'done')),
  add column stage_changed_at timestamptz not null default now();

update public.todo_items
set stage = 'done', stage_changed_at = handled_at
where handled_at is not null;

drop index public.todo_items_open;
create index todo_items_live on public.todo_items (workspace_id, stage, position)
  where deleted_at is null;

-- These read handled_at, so they're replaced before the column goes.
drop function public.remove_todo_items(uuid, uuid[], text);
drop function public.list_todo_items(uuid);  -- return type changes

create function public.list_todo_items(target_workspace_id uuid)
returns table (
  id uuid, project_id uuid, text text, stage text,
  "position" double precision, created_at timestamptz, stage_changed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if auth.uid() is null or not public.is_workspace_member(target_workspace_id) then
    raise exception 'Workspace not found.' using errcode = '42501';
  end if;
  return query
    select live.id, live.project_id, live.text, live.stage, live.position, live.created_at, live.stage_changed_at
    from (
      select item.*
      from public.todo_items as item
      where item.workspace_id = target_workspace_id
        and item.deleted_at is null
        and item.stage <> 'done'
      union all
      (select item.*
       from public.todo_items as item
       where item.workspace_id = target_workspace_id
         and item.deleted_at is null
         and item.stage = 'done'
       order by item.stage_changed_at desc
       limit 50)
    ) as live
    order by live.position, live.created_at;
end;
$$;

create or replace function public.save_todo_item(
  target_workspace_id uuid,
  item_id uuid,
  item_text text,
  item_project_id uuid,
  item_position double precision
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_workspace_member(target_workspace_id) then
    raise exception 'Workspace not found.' using errcode = '42501';
  end if;
  insert into public.todo_items as item (id, workspace_id, project_id, text, author, position)
  values (item_id, target_workspace_id, item_project_id, btrim(item_text), 'owner', item_position)
  on conflict (id) do update
    set text = excluded.text,
        project_id = excluded.project_id,
        position = excluded.position,
        updated_at = now()
    where item.workspace_id = target_workspace_id
      and item.stage = 'todo'
      and item.deleted_at is null;
end;
$$;

create function public.set_todo_stage(
  target_workspace_id uuid,
  item_ids uuid[],
  new_stage text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_workspace_member(target_workspace_id) then
    raise exception 'Workspace not found.' using errcode = '42501';
  end if;
  if new_stage not in ('todo', 'in_progress', 'done') then
    raise exception 'Unknown stage.' using errcode = '22023';
  end if;
  update public.todo_items
  set stage = new_stage, stage_changed_at = now(), updated_at = now()
  where workspace_id = target_workspace_id
    and id = any(item_ids)
    and deleted_at is null
    and stage <> new_stage;
end;
$$;

create function public.delete_todo_items(
  target_workspace_id uuid,
  item_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_workspace_member(target_workspace_id) then
    raise exception 'Workspace not found.' using errcode = '42501';
  end if;
  update public.todo_items
  set deleted_at = now(), updated_at = now()
  where workspace_id = target_workspace_id
    and id = any(item_ids)
    and deleted_at is null;
end;
$$;

create or replace function public.morning_todo_facts(
  target_workspace_id uuid,
  target_user_id uuid,
  max_projects integer
)
returns table (
  project_id uuid,
  project_name text,
  summary text,
  since timestamptz,
  activity_count integer,
  facts jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with project_since as (
    select project.id as project_id, project.name as project_name,
           coalesce(brief.summary, '') as summary,
           coalesce(brief.last_read_at, now() - interval '7 days') as since
    from public.projects as project
    left join public.project_briefs as brief on brief.project_id = project.id
    where project.workspace_id = target_workspace_id
  ),
  room_scope as (
    select room.id as room_id, room.name as room_name, scope.project_id, scope.since
    from public.rooms as room
    join project_since as scope on scope.project_id = room.project_id
    where room.workspace_id = target_workspace_id
  ),
  new_messages as (
    select scope.project_id, msg.created_at as at,
           jsonb_build_object(
             'room', scope.room_name,
             'from', case when msg.author_type = 'product_agent' then 'orion' else 'you' end,
             'text', left(msg.body, 2000),
             'at', msg.created_at) as fact
    from public.messages as msg
    join room_scope as scope on scope.room_id = msg.room_id
    where msg.created_at > scope.since
  ),
  new_decisions as (
    select scope.project_id, decision.created_at as at,
           jsonb_build_object('room', scope.room_name, 'summary', left(decision.summary, 1000),
                              'at', decision.created_at) as fact
    from public.decisions as decision
    join room_scope as scope on scope.room_id = decision.room_id
    where decision.created_at > scope.since
  ),
  new_prds as (
    select scope.project_id, prd.updated_at as at,
           jsonb_build_object('room', scope.room_name, 'version', prd.version,
                              'status', prd.status::text, 'at', prd.updated_at) as fact
    from public.prds as prd
    join room_scope as scope on scope.room_id = prd.room_id
    where prd.updated_at > scope.since
  ),
  new_screens as (
    select scope.project_id, screen.updated_at as at,
           jsonb_build_object('room', scope.room_name, 'name', screen.name,
                              'state', screen.state::text, 'at', screen.updated_at) as fact
    from public.design_screens as screen
    join room_scope as scope on scope.room_id = screen.room_id
    where screen.deleted_at is null and screen.updated_at > scope.since
  ),
  new_tasks as (
    select scope.project_id, task.updated_at as at,
           jsonb_build_object('room', scope.room_name, 'kind', task.kind::text,
                              'status', task.status::text, 'at', task.updated_at) as fact
    from public.ai_tasks as task
    join room_scope as scope on scope.room_id = task.room_id
    left join public.room_views as view
      on view.room_id = task.room_id and view.user_id = target_user_id
    where task.updated_at > scope.since
      and (
        task.status in ('failed', 'needs_reauthentication', 'usage_limit_reached', 'needs_review')
        or (task.status = 'completed'
            and (view.last_viewed_at is null or view.last_viewed_at < task.updated_at))
      )
  ),
  activity as (
    select project_id, count(*)::integer as n
    from (
      select project_id from new_messages
      union all select project_id from new_decisions
      union all select project_id from new_prds
      union all select project_id from new_screens
      union all select project_id from new_tasks
    ) as everything
    group by project_id
  )
  select scope.project_id, scope.project_name, scope.summary, scope.since, activity.n,
    jsonb_build_object(
      'messages', coalesce((
        select jsonb_agg(latest.fact order by latest.at desc)
        from (select fact, at from new_messages
              where new_messages.project_id = scope.project_id
              order by at desc limit 60) as latest), '[]'::jsonb),
      'decisions', coalesce((select jsonb_agg(fact order by at desc) from new_decisions
                             where new_decisions.project_id = scope.project_id), '[]'::jsonb),
      'prds', coalesce((select jsonb_agg(fact order by at desc) from new_prds
                        where new_prds.project_id = scope.project_id), '[]'::jsonb),
      'screens', coalesce((select jsonb_agg(fact order by at desc) from new_screens
                           where new_screens.project_id = scope.project_id), '[]'::jsonb),
      'tasks', coalesce((select jsonb_agg(fact order by at desc) from new_tasks
                         where new_tasks.project_id = scope.project_id), '[]'::jsonb),
      'open_todos', coalesce((
        select jsonb_agg(item.text order by item.position)
        from public.todo_items as item
        where item.workspace_id = target_workspace_id
          and item.project_id = scope.project_id
          and item.stage <> 'done' and item.deleted_at is null), '[]'::jsonb),
      'known_todos', coalesce((
        select jsonb_agg(item.text)
        from public.todo_items as item
        where item.workspace_id = target_workspace_id
          and item.project_id = scope.project_id), '[]'::jsonb)
    )
  from project_since as scope
  join activity on activity.project_id = scope.project_id
  order by activity.n desc, scope.project_id
  limit greatest(max_projects, 0);
$$;

alter table public.todo_items drop column handled_at;

revoke all on function
  public.list_todo_items(uuid),
  public.set_todo_stage(uuid, uuid[], text),
  public.delete_todo_items(uuid, uuid[])
from public, anon, authenticated;

grant execute on function
  public.list_todo_items(uuid),
  public.set_todo_stage(uuid, uuid[], text),
  public.delete_todo_items(uuid, uuid[])
to authenticated;
```
`create or replace` keeps the existing grants on `save_todo_item` and `morning_todo_facts`.

- [ ] **Step 4: Apply and run the test**

```bash
docker exec -i supabase_db_meld psql -U postgres -d morning_scratch -v ON_ERROR_STOP=1 < supabase/migrations/20261109000003_todo_stages.sql
docker exec -i supabase_db_meld psql -U postgres -d morning_scratch -v ON_ERROR_STOP=1 < supabase/tests/morning_todos.test.sql
pnpm test:sql
```
Expected: `ok 1` … `ok 25`, and `test:sql` PASS. Also replay **all** migrations into a fresh scratch DB once, to prove 000002 → 000003 applies cleanly from zero.

- [ ] **Step 5: Apply to the shared local dev DB without wiping it**

```bash
which supabase   # must be ~/.local/share/supabase/supabase
supabase migration up --local
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261109000003_todo_stages.sql supabase/tests/morning_todos.test.sql
git commit -m "feat(db): to-do stages for Todo, In progress and Completed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Shared contract for to-dos

**Files:**
- Create: `packages/contracts/src/todos.ts`
- Test: `packages/contracts/src/todos.test.ts`
- Modify: `packages/contracts/src/index.ts`

**Interfaces:**
- Produces:
  - `TodoStageSchema` / `type TodoStage = "todo" | "in_progress" | "done"`
  - `TodoItemSchema` / `type TodoItem = { id: string; projectId: string | null; text: string; stage: TodoStage; position: number; createdAt: string }`
  - `MorningTodosOutputSchema` / `type MorningTodosOutput = { summary: string; todos: string[] }`
  - `normalizeTodoText(text: string): string`
  - `TODO_TEXT_MAX = 500`

- [ ] **Step 1: Write the failing test**

```ts
// packages/contracts/src/todos.test.ts
import { describe, expect, it } from "vitest";
import { MorningTodosOutputSchema, normalizeTodoText, TodoItemSchema } from "./todos";

describe("normalizeTodoText", () => {
  it("lowercases, drops punctuation and collapses spaces", () => {
    expect(normalizeTodoText("  Update the USER flow!!  for sign-up. ")).toBe("update the user flow for signup");
  });
  it("keeps non-English letters and digits", () => {
    expect(normalizeTodoText("Écrire 2 pages")).toBe("écrire 2 pages");
  });
});

describe("TodoItemSchema", () => {
  it("accepts a saved line", () => {
    const item = TodoItemSchema.parse({
      id: "b8000000-0000-4000-8000-000000000001",
      projectId: null,
      text: "Write the launch email",
      stage: "in_progress",
      position: 1,
      createdAt: "2026-11-09T06:00:00Z",
    });
    expect(item.text).toBe("Write the launch email");
    expect(item.stage).toBe("in_progress");
  });
});

describe("MorningTodosOutputSchema", () => {
  it("accepts summary + todos", () => {
    expect(MorningTodosOutputSchema.parse({ summary: "s", todos: ["a"] }).todos).toEqual(["a"]);
  });
  it("defaults missing todos to an empty list", () => {
    expect(MorningTodosOutputSchema.parse({ summary: "s" }).todos).toEqual([]);
  });
  it("rejects a non-string todo", () => {
    expect(() => MorningTodosOutputSchema.parse({ summary: "s", todos: [1] })).toThrow();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm --filter @meld/contracts exec vitest run src/todos.test.ts`
Expected: FAIL, `Cannot find module './todos'`.

- [ ] **Step 3: Implement**

```ts
// packages/contracts/src/todos.ts
import { z } from "zod";

export const TODO_TEXT_MAX = 500;

export const TodoStageSchema = z.enum(["todo", "in_progress", "done"]);
export type TodoStage = z.infer<typeof TodoStageSchema>;

export const TodoItemSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid().nullable(),
  text: z.string().trim().min(1).max(TODO_TEXT_MAX),
  stage: TodoStageSchema,
  position: z.number(),
  createdAt: z.string(),
});
export type TodoItem = z.infer<typeof TodoItemSchema>;

export const MorningTodosOutputSchema = z.object({
  summary: z.string().max(8000),
  todos: z.array(z.string()).max(20).default([]),
});
export type MorningTodosOutput = z.infer<typeof MorningTodosOutputSchema>;

/** The dedupe key: lowercase, letters/digits/spaces only, spaces collapsed. */
export function normalizeTodoText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}
```

Add to `packages/contracts/src/index.ts` (same style as the other lines there):

```ts
export * from "./todos";
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @meld/contracts exec vitest run src/todos.test.ts && pnpm --filter @meld/contracts typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/todos.ts packages/contracts/src/todos.test.ts packages/contracts/src/index.ts
git commit -m "feat(contracts): to-do item and morning output schemas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Morning clock and fact shaping

**Files:**
- Create: `apps/gateway/src/morning-todos/clock.ts`, `clock.test.ts`
- Create: `apps/gateway/src/morning-todos/facts.ts`, `facts.test.ts`

**Interfaces:**
- Consumes: `normalizeTodoText` (Task 2).
- Produces:
  - `FALLBACK_TIME_ZONE = "Europe/London"`
  - `localClock(now: Date, timeZone: string | null): { hour: number; date: string /* YYYY-MM-DD */ }` (an invalid zone falls back)
  - `isMorningWindow(hour: number): boolean` (6 ≤ hour ≤ 9)
  - `type ProjectFacts = { projectId: string; projectName: string; summary: string; since: string; activityCount: number; facts: FactBundle }`
  - `type FactBundle = { messages: {room:string;from:"you"|"orion";text:string;at:string}[]; decisions: {room:string;summary:string;at:string}[]; prds: {room:string;version:number;status:string;at:string}[]; screens: {room:string;name:string;state:string;at:string}[]; tasks: {room:string;kind:string;status:string;at:string}[]; open_todos: string[]; known_todos: string[] }`
  - `FactBundleSchema` (zod)
  - `renderFacts(project: ProjectFacts, maxWords?: number): string` (default 6,000; newest first; oldest messages dropped first)
  - `filterNewTodos(candidates: string[], known: string[], limit?: number): string[]` (default limit 5)

- [ ] **Step 1: Write the failing tests**

```ts
// apps/gateway/src/morning-todos/clock.test.ts
import { describe, expect, it } from "vitest";
import { isMorningWindow, localClock } from "./clock";

describe("localClock", () => {
  it("reads the hour and date in the owner's zone", () => {
    // 05:30 UTC on 10 Nov = 06:30 in Lagos (UTC+1)
    expect(localClock(new Date("2026-11-10T05:30:00Z"), "Africa/Lagos")).toEqual({ hour: 6, date: "2026-11-10" });
  });
  it("rolls the date across midnight", () => {
    // 23:30 UTC 9 Nov = 08:30 10 Nov in Tokyo
    expect(localClock(new Date("2026-11-09T23:30:00Z"), "Asia/Tokyo")).toEqual({ hour: 8, date: "2026-11-10" });
  });
  it("falls back to London for a missing or bad zone", () => {
    expect(localClock(new Date("2026-07-01T05:00:00Z"), null)).toEqual({ hour: 6, date: "2026-07-01" });
    expect(localClock(new Date("2026-07-01T05:00:00Z"), "Mars/Olympus")).toEqual({ hour: 6, date: "2026-07-01" });
  });
  it("follows daylight saving", () => {
    expect(localClock(new Date("2026-01-15T06:00:00Z"), "Europe/London").hour).toBe(6);
    expect(localClock(new Date("2026-07-15T06:00:00Z"), "Europe/London").hour).toBe(7);
  });
});

describe("isMorningWindow", () => {
  it("is open from 6 to 9 inclusive", () => {
    expect([5, 6, 9, 10].map(isMorningWindow)).toEqual([false, true, true, false]);
  });
});
```

```ts
// apps/gateway/src/morning-todos/facts.test.ts
import { describe, expect, it } from "vitest";
import { filterNewTodos, renderFacts, type ProjectFacts } from "./facts";

function project(messages: number): ProjectFacts {
  return {
    projectId: "p1", projectName: "Mark", summary: "Onboarding in progress.",
    since: "2026-11-09T06:00:00Z", activityCount: messages,
    facts: {
      messages: Array.from({ length: messages }, (_, i) => ({
        room: "Main", from: "you" as const, text: `message ${i} ` + "word ".repeat(100), at: `2026-11-09T${String(10 + (i % 10)).padStart(2, "0")}:00:00Z`,
      })),
      decisions: [{ room: "Main", summary: "Use magic links", at: "2026-11-09T09:00:00Z" }],
      prds: [], screens: [], tasks: [{ room: "Main", kind: "prd_generate", status: "failed", at: "2026-11-09T08:00:00Z" }],
      open_todos: ["Pick a login style"], known_todos: ["Pick a login style"],
    },
  };
}

describe("renderFacts", () => {
  it("includes the summary, decisions, tasks and open to-dos", () => {
    const text = renderFacts(project(2));
    expect(text).toContain("Onboarding in progress.");
    expect(text).toContain("Use magic links");
    expect(text).toContain("prd_generate");
    expect(text).toContain("Pick a login style");
  });
  it("cuts the oldest messages to stay under the word budget", () => {
    const text = renderFacts(project(200), 2000);
    expect(text.split(/\s+/).length).toBeLessThanOrEqual(2000);
    expect(text).toContain("message 0 ");
    expect(text).not.toContain("message 199 ");
  });
});

describe("filterNewTodos", () => {
  it("drops known, duplicate and blank to-dos and caps at 5", () => {
    const out = filterNewTodos(
      ["Pick a login style!", "Draft pricing", "draft  pricing", " ", "A", "B", "C", "D", "E"],
      ["pick a login style"],
    );
    expect(out).toEqual(["Draft pricing", "A", "B", "C", "D"]);
  });
  it("trims and drops over-long lines", () => {
    expect(filterNewTodos(["  Ship it  ", "x".repeat(501)], [])).toEqual(["Ship it"]);
  });
});
```

The test fixtures index messages newest-first: `message 0` is newest, matching the SQL's `order by at desc`.

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm --filter @meld/gateway exec vitest run src/morning-todos`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement `clock.ts`**

```ts
// apps/gateway/src/morning-todos/clock.ts
export const FALLBACK_TIME_ZONE = "Europe/London";

function validZone(zone: string | null): string {
  if (!zone) return FALLBACK_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
    return zone;
  } catch {
    return FALLBACK_TIME_ZONE;
  }
}

export function localClock(now: Date, timeZone: string | null): { hour: number; date: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: validZone(timeZone),
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { hour: Number(get("hour")), date: `${get("year")}-${get("month")}-${get("day")}` };
}

export function isMorningWindow(hour: number): boolean {
  return hour >= 6 && hour <= 9;
}
```

- [ ] **Step 4: Implement `facts.ts`**

```ts
// apps/gateway/src/morning-todos/facts.ts
import { normalizeTodoText, TODO_TEXT_MAX } from "@meld/contracts";
import { z } from "zod";

export const FactBundleSchema = z.object({
  messages: z.array(z.object({ room: z.string(), from: z.enum(["you", "orion"]), text: z.string(), at: z.string() })).default([]),
  decisions: z.array(z.object({ room: z.string(), summary: z.string(), at: z.string() })).default([]),
  prds: z.array(z.object({ room: z.string(), version: z.number(), status: z.string(), at: z.string() })).default([]),
  screens: z.array(z.object({ room: z.string(), name: z.string(), state: z.string(), at: z.string() })).default([]),
  tasks: z.array(z.object({ room: z.string(), kind: z.string(), status: z.string(), at: z.string() })).default([]),
  open_todos: z.array(z.string()).default([]),
  known_todos: z.array(z.string()).default([]),
});
export type FactBundle = z.infer<typeof FactBundleSchema>;

export type ProjectFacts = {
  projectId: string;
  projectName: string;
  summary: string;
  since: string;
  activityCount: number;
  facts: FactBundle;
};

const DEFAULT_MAX_WORDS = 6000;
const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** Plain-text brief for the model. Fixed sections first; messages fill the rest, newest first. */
export function renderFacts(project: ProjectFacts, maxWords = DEFAULT_MAX_WORDS): string {
  const { facts } = project;
  const fixed = [
    `Project: ${project.projectName}`,
    `What you knew before: ${project.summary || "(nothing yet)"}`,
    `New since ${project.since}:`,
    ...facts.decisions.map((d) => `- Decision in ${d.room}: ${d.summary}`),
    ...facts.prds.map((p) => `- PRD v${p.version} in ${p.room} is ${p.status}`),
    ...facts.screens.map((s) => `- Screen "${s.name}" in ${s.room} is ${s.state}`),
    ...facts.tasks.map((t) => `- AI work ${t.kind} in ${t.room}: ${t.status}`),
    `Open to-dos already on the list (do not repeat): ${facts.open_todos.join(" | ") || "(none)"}`,
    "Chat, newest first:",
  ];
  const lines = [...fixed];
  let budget = maxWords - words(fixed.join("\n"));
  for (const message of facts.messages) {
    const line = `- [${message.room}] ${message.from}: ${message.text}`;
    const cost = words(line);
    if (cost > budget) break;
    lines.push(line);
    budget -= cost;
  }
  return lines.join("\n");
}

export function filterNewTodos(candidates: string[], known: string[], limit = 5): string[] {
  const seen = new Set(known.map(normalizeTodoText));
  const out: string[] = [];
  for (const raw of candidates) {
    const text = raw.trim();
    const key = normalizeTodoText(text);
    if (!key || text.length > TODO_TEXT_MAX || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length === limit) break;
  }
  return out;
}
```

If the `@meld/contracts` import fails in `apps/gateway`, check that `"@meld/contracts": "workspace:*"` is already in `apps/gateway/package.json` (it is) and that `zod` is a dependency (it is, 4.4.3).

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @meld/gateway exec vitest run src/morning-todos && pnpm --filter @meld/gateway typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/gateway/src/morning-todos/clock.ts apps/gateway/src/morning-todos/clock.test.ts apps/gateway/src/morning-todos/facts.ts apps/gateway/src/morning-todos/facts.test.ts
git commit -m "feat(gateway): morning window clock and fact shaping for to-dos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: DeepSeek to-do writer

**Files:**
- Create: `apps/gateway/src/morning-todos/deepseek-todo-writer.ts`
- Test: `apps/gateway/src/morning-todos/deepseek-todo-writer.test.ts`

**Interfaces:**
- Consumes: `MorningTodosOutputSchema`, `MorningTodosOutput` (Task 2).
- Produces:
  - `type TodoWriter = { model: string; write(brief: string): Promise<MorningTodosOutput> }`
  - `class TodoWriterError extends Error { code: "network" | "timeout" | "http" | "bad_json" | "invalid_response" }`
  - `createDeepSeekTodoWriter({ apiKey, model, fetch?, timeoutMs? }): TodoWriter`
  - `DEEPSEEK_TODO_DEFAULT_MODEL = "deepseek-flash"`
  - `TODO_SYSTEM_PROMPT: string`

- [ ] **Step 1: Write the failing test**

```ts
// apps/gateway/src/morning-todos/deepseek-todo-writer.test.ts
import { describe, expect, it, vi } from "vitest";
import { createDeepSeekTodoWriter, TodoWriterError } from "./deepseek-todo-writer";

function reply(content: unknown, status = 200) {
  return new Response(JSON.stringify({ choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }] }), { status });
}

describe("createDeepSeekTodoWriter", () => {
  it("sends the brief and parses summary + todos", async () => {
    const fetch = vi.fn().mockResolvedValue(reply({ summary: "S", todos: ["Draft pricing"] }));
    const writer = createDeepSeekTodoWriter({ apiKey: "k", model: "deepseek-flash", fetch });
    await expect(writer.write("brief text")).resolves.toEqual({ summary: "S", todos: ["Draft pricing"] });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: "deepseek-flash", temperature: 0.2, response_format: { type: "json_object" } });
    expect(body.messages[1]).toEqual({ role: "user", content: "brief text" });
    expect(init.headers.Authorization).toBe("Bearer k");
  });

  it.each([
    ["http", () => new Response("no", { status: 500 })],
    ["bad_json", () => reply("not json")],
    ["invalid_response", () => reply({ todos: "nope" })],
  ])("throws %s", async (code, make) => {
    const writer = createDeepSeekTodoWriter({ apiKey: "k", model: "m", fetch: vi.fn().mockResolvedValue(make()) });
    await expect(writer.write("b")).rejects.toMatchObject({ code });
  });

  it("maps a timeout", async () => {
    const fetch = vi.fn().mockRejectedValue(new DOMException("t", "TimeoutError"));
    const writer = createDeepSeekTodoWriter({ apiKey: "k", model: "m", fetch });
    await expect(writer.write("b")).rejects.toBeInstanceOf(TodoWriterError);
    await expect(writer.write("b")).rejects.toMatchObject({ code: "timeout" });
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm --filter @meld/gateway exec vitest run src/morning-todos/deepseek-todo-writer.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
// apps/gateway/src/morning-todos/deepseek-todo-writer.ts
import { MorningTodosOutputSchema, type MorningTodosOutput } from "@meld/contracts";

export const DEEPSEEK_TODO_DEFAULT_MODEL = "deepseek-flash";
const ENDPOINT = "https://api.deepseek.com/chat/completions";
const DEFAULT_TIMEOUT_MS = 30_000;

export const TODO_SYSTEM_PROMPT = [
  "You help a solo founder start their day. You get one project's running summary and what changed since yesterday.",
  "Return JSON: {\"summary\": string, \"todos\": string[]}.",
  "summary: a fresh, plain description of where the project stands, at most 400 words, replacing the old one.",
  "todos: at most 5 things the founder should pick up today, written the way they would write their own to-do:",
  "short, imperative, one action each, under 120 characters, no project name, no numbering, no emoji.",
  "Good examples: \"Update the user flow for sign-up\", \"Answer Orion's question about pricing tiers\", \"Retry the PRD that failed\".",
  "Only include things that are clearly still open. Never repeat or rephrase a to-do listed as already on the list.",
  "If nothing needs the founder, return an empty todos list.",
].join("\n");

export type TodoWriter = { model: string; write(brief: string): Promise<MorningTodosOutput> };
export type TodoWriterErrorCode = "network" | "timeout" | "http" | "bad_json" | "invalid_response";

export class TodoWriterError extends Error {
  constructor(readonly code: TodoWriterErrorCode) {
    super(`Morning to-do writing failed: ${code}`);
    this.name = "TodoWriterError";
  }
}

export function createDeepSeekTodoWriter({
  apiKey,
  model,
  fetch = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: {
  apiKey: string;
  model: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}): TodoWriter {
  return {
    model,
    async write(brief) {
      let response: Response;
      try {
        response = await fetch(ENDPOINT, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: TODO_SYSTEM_PROMPT },
              { role: "user", content: brief },
            ],
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        const isTimeout = error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
        throw new TodoWriterError(isTimeout ? "timeout" : "network");
      }
      if (!response.ok) throw new TodoWriterError("http");
      let parsed: unknown;
      try {
        const body = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
        const content = body.choices?.[0]?.message?.content;
        parsed = JSON.parse(typeof content === "string" ? content : "");
      } catch {
        throw new TodoWriterError("bad_json");
      }
      const result = MorningTodosOutputSchema.safeParse(parsed);
      if (!result.success) throw new TodoWriterError("invalid_response");
      return result.data;
    },
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @meld/gateway exec vitest run src/morning-todos && pnpm --filter @meld/gateway typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/gateway/src/morning-todos/deepseek-todo-writer.ts apps/gateway/src/morning-todos/deepseek-todo-writer.test.ts
git commit -m "feat(gateway): DeepSeek writer for morning to-dos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The morning run (repository + orchestrator)

**Files:**
- Create: `apps/gateway/src/morning-todos/run-morning-todos.ts`
- Test: `apps/gateway/src/morning-todos/run-morning-todos.test.ts`
- Modify: `apps/gateway/src/core.ts`

**Interfaces:**
- Consumes: `localClock`, `isMorningWindow` (Task 3), `renderFacts`, `filterNewTodos`, `FactBundleSchema`, `ProjectFacts` (Task 3), `TodoWriter` (Task 4), the Task 1 service functions.
- Produces:
  - `type MorningRpcClient = { rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> }` (a Supabase client satisfies this)
  - `createMorningRepository(client: MorningRpcClient): MorningRepository` with `listWorkspaces()`, `claim(workspaceId, date)`, `facts(workspaceId, userId, max)`, `save(workspaceId, projectId, summary, todos, readUntil)`, `finish(workspaceId, date, status, read, added)`
  - `runMorningTodos({ repository, writer, now, force?, log? }): Promise<MorningRunReport[]>`
  - `type MorningRunReport = { workspaceId: string; status: "skipped" | "done" | "failed"; projectsRead: number; itemsAdded: number }`
  - `MAX_PROJECTS_PER_RUN = 10`
- `core.ts` re-exports all of the above, plus `createDeepSeekTodoWriter` and `DEEPSEEK_TODO_DEFAULT_MODEL`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/gateway/src/morning-todos/run-morning-todos.test.ts
import { describe, expect, it, vi } from "vitest";
import type { TodoWriter } from "./deepseek-todo-writer";
import { TodoWriterError } from "./deepseek-todo-writer";
import { runMorningTodos, type MorningRepository } from "./run-morning-todos";
import type { ProjectFacts } from "./facts";

const SIX_THIRTY_LONDON = new Date("2026-11-10T06:30:00Z");

function facts(id: string, known: string[] = []): ProjectFacts {
  return {
    projectId: id, projectName: id, summary: "", since: "2026-11-09T06:00:00Z", activityCount: 1,
    facts: { messages: [], decisions: [], prds: [], screens: [], tasks: [], open_todos: known, known_todos: known },
  };
}

function repo(overrides: Partial<MorningRepository> = {}): MorningRepository {
  return {
    listWorkspaces: vi.fn().mockResolvedValue([{ workspaceId: "w1", ownerUserId: "u1", timeZone: null }]),
    claim: vi.fn().mockResolvedValue(true),
    facts: vi.fn().mockResolvedValue([facts("p1", ["Pick a login style"]), facts("p2")]),
    save: vi.fn().mockImplementation(async (_w, _p, _s, todos: string[]) => todos.length),
    finish: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const writer = (out: Record<string, { summary: string; todos: string[] } | Error>): TodoWriter => ({
  model: "m",
  write: vi.fn(async (brief: string) => {
    const key = brief.match(/^Project: (\S+)/)?.[1] ?? "";
    const value = out[key];
    if (value instanceof Error) throw value;
    return value;
  }),
});

describe("runMorningTodos", () => {
  it("skips outside 6–9 local", async () => {
    const repository = repo();
    const report = await runMorningTodos({ repository, writer: writer({}), now: new Date("2026-11-10T12:00:00Z") });
    expect(report).toEqual([{ workspaceId: "w1", status: "skipped", projectsRead: 0, itemsAdded: 0 }]);
    expect(repository.claim).not.toHaveBeenCalled();
  });

  it("skips when the day is already claimed", async () => {
    const repository = repo({ claim: vi.fn().mockResolvedValue(false) });
    const report = await runMorningTodos({ repository, writer: writer({}), now: SIX_THIRTY_LONDON });
    expect(report[0].status).toBe("skipped");
    expect(repository.facts).not.toHaveBeenCalled();
  });

  it("writes filtered to-dos per project and finishes done", async () => {
    const repository = repo();
    const report = await runMorningTodos({
      repository, now: SIX_THIRTY_LONDON,
      writer: writer({ p1: { summary: "S1", todos: ["Pick a login style.", "Draft pricing"] }, p2: { summary: "S2", todos: [] } }),
    });
    expect(repository.claim).toHaveBeenCalledWith("w1", "2026-11-10");
    expect(repository.facts).toHaveBeenCalledWith("w1", "u1", 10);
    expect(repository.save).toHaveBeenCalledWith("w1", "p1", "S1", ["Draft pricing"], SIX_THIRTY_LONDON.toISOString());
    expect(repository.save).toHaveBeenCalledWith("w1", "p2", "S2", [], SIX_THIRTY_LONDON.toISOString());
    expect(repository.finish).toHaveBeenCalledWith("w1", "2026-11-10", "done", 2, 1);
    expect(report[0]).toEqual({ workspaceId: "w1", status: "done", projectsRead: 2, itemsAdded: 1 });
  });

  it("keeps going when one project fails and never logs content", async () => {
    const repository = repo();
    const log = vi.fn();
    await runMorningTodos({
      repository, now: SIX_THIRTY_LONDON, log,
      writer: writer({ p1: new TodoWriterError("http"), p2: { summary: "S2", todos: ["Ship it"] } }),
    });
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(repository.finish).toHaveBeenCalledWith("w1", "2026-11-10", "done", 1, 1);
    expect(log).toHaveBeenCalledWith("morning to-dos: project failed", { workspaceId: "w1", projectId: "p1", code: "http" });
  });

  it("marks the run failed when every project fails", async () => {
    const repository = repo();
    await runMorningTodos({
      repository, now: SIX_THIRTY_LONDON,
      writer: writer({ p1: new TodoWriterError("http"), p2: new TodoWriterError("timeout") }),
    });
    expect(repository.finish).toHaveBeenCalledWith("w1", "2026-11-10", "failed", 0, 0);
  });

  it("force ignores the window", async () => {
    const repository = repo();
    const report = await runMorningTodos({ repository, writer: writer({ p1: { summary: "", todos: [] }, p2: { summary: "", todos: [] } }), now: new Date("2026-11-10T15:00:00Z"), force: true });
    expect(report[0].status).toBe("done");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm --filter @meld/gateway exec vitest run src/morning-todos/run-morning-todos.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
// apps/gateway/src/morning-todos/run-morning-todos.ts
import { isMorningWindow, localClock } from "./clock";
import { TodoWriterError, type TodoWriter } from "./deepseek-todo-writer";
import { FactBundleSchema, filterNewTodos, renderFacts, type ProjectFacts } from "./facts";

export const MAX_PROJECTS_PER_RUN = 10;

export type MorningRpcClient = {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export type MorningWorkspace = { workspaceId: string; ownerUserId: string; timeZone: string | null };

export type MorningRepository = {
  listWorkspaces(): Promise<MorningWorkspace[]>;
  claim(workspaceId: string, localDate: string): Promise<boolean>;
  facts(workspaceId: string, userId: string, maxProjects: number): Promise<ProjectFacts[]>;
  save(workspaceId: string, projectId: string, summary: string, todos: string[], readUntil: string): Promise<number>;
  finish(workspaceId: string, localDate: string, status: "done" | "failed", projectsRead: number, itemsAdded: number): Promise<void>;
};

export type MorningRunReport = {
  workspaceId: string;
  status: "skipped" | "done" | "failed";
  projectsRead: number;
  itemsAdded: number;
};

type Log = (message: string, details: Record<string, unknown>) => void;

async function call(client: MorningRpcClient, fn: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn} failed`);
  return data;
}

export function createMorningRepository(client: MorningRpcClient): MorningRepository {
  return {
    async listWorkspaces() {
      const rows = (await call(client, "list_morning_workspaces", {})) as
        { workspace_id: string; owner_user_id: string; time_zone: string | null }[] | null;
      return (rows ?? []).map((row) => ({ workspaceId: row.workspace_id, ownerUserId: row.owner_user_id, timeZone: row.time_zone }));
    },
    async claim(workspaceId, localDate) {
      return (await call(client, "claim_morning_run", { target_workspace_id: workspaceId, target_local_date: localDate })) === true;
    },
    async facts(workspaceId, userId, maxProjects) {
      const rows = (await call(client, "morning_todo_facts", {
        target_workspace_id: workspaceId, target_user_id: userId, max_projects: maxProjects,
      })) as { project_id: string; project_name: string; summary: string; since: string; activity_count: number; facts: unknown }[] | null;
      return (rows ?? []).flatMap((row) => {
        const bundle = FactBundleSchema.safeParse(row.facts);
        if (!bundle.success) return [];
        return [{
          projectId: row.project_id, projectName: row.project_name, summary: row.summary,
          since: row.since, activityCount: row.activity_count, facts: bundle.data,
        }];
      });
    },
    async save(workspaceId, projectId, summary, todos, readUntil) {
      const added = await call(client, "save_morning_todos", {
        target_workspace_id: workspaceId, target_project_id: projectId,
        new_summary: summary, todo_texts: todos, read_until: readUntil,
      });
      return typeof added === "number" ? added : 0;
    },
    async finish(workspaceId, localDate, status, projectsRead, itemsAdded) {
      await call(client, "finish_morning_run", {
        target_workspace_id: workspaceId, target_local_date: localDate,
        run_status: status, read_count: projectsRead, added_count: itemsAdded,
      });
    },
  };
}

export async function runMorningTodos({
  repository,
  writer,
  now,
  force = false,
  log = (message, details) => console.warn(message, details),
}: {
  repository: MorningRepository;
  writer: TodoWriter;
  now: Date;
  force?: boolean;
  log?: Log;
}): Promise<MorningRunReport[]> {
  const reports: MorningRunReport[] = [];
  for (const workspace of await repository.listWorkspaces()) {
    const clock = localClock(now, workspace.timeZone);
    const skipped: MorningRunReport = { workspaceId: workspace.workspaceId, status: "skipped", projectsRead: 0, itemsAdded: 0 };
    if (!force && !isMorningWindow(clock.hour)) { reports.push(skipped); continue; }
    if (!(await repository.claim(workspace.workspaceId, clock.date))) { reports.push(skipped); continue; }

    const readUntil = now.toISOString();
    let projectsRead = 0;
    let itemsAdded = 0;
    let failures = 0;
    let projects: ProjectFacts[] = [];
    try {
      projects = await repository.facts(workspace.workspaceId, workspace.ownerUserId, MAX_PROJECTS_PER_RUN);
    } catch {
      log("morning to-dos: facts failed", { workspaceId: workspace.workspaceId });
      failures += 1;
    }
    for (const project of projects) {
      try {
        const output = await writer.write(renderFacts(project));
        const todos = filterNewTodos(output.todos, project.facts.known_todos);
        itemsAdded += await repository.save(workspace.workspaceId, project.projectId, output.summary, todos, readUntil);
        projectsRead += 1;
      } catch (error) {
        failures += 1;
        log("morning to-dos: project failed", {
          workspaceId: workspace.workspaceId,
          projectId: project.projectId,
          code: error instanceof TodoWriterError ? error.code : "save",
        });
      }
    }
    const status = failures > 0 && projectsRead === 0 ? "failed" : "done";
    await repository.finish(workspace.workspaceId, clock.date, status, projectsRead, itemsAdded);
    reports.push({ workspaceId: workspace.workspaceId, status, projectsRead, itemsAdded });
  }
  return reports;
}
```

Append to `apps/gateway/src/core.ts`:

```ts
export {
  createDeepSeekTodoWriter,
  DEEPSEEK_TODO_DEFAULT_MODEL,
  type TodoWriter,
} from "./morning-todos/deepseek-todo-writer";
export {
  createMorningRepository,
  MAX_PROJECTS_PER_RUN,
  runMorningTodos,
  type MorningRepository,
  type MorningRpcClient,
  type MorningRunReport,
} from "./morning-todos/run-morning-todos";
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @meld/gateway exec vitest run src/morning-todos && pnpm --filter @meld/gateway typecheck && pnpm --filter @meld/gateway lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/gateway/src/morning-todos/run-morning-todos.ts apps/gateway/src/morning-todos/run-morning-todos.test.ts apps/gateway/src/core.ts
git commit -m "feat(gateway): morning to-do run loop with per-day claim and caps

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Worker hourly cron + manual runner

**Files:**
- Create: `apps/gateway-worker/src/scheduled.ts`, `scheduled.test.ts`
- Modify: `apps/gateway-worker/src/env.ts`, `src/index.ts`, `wrangler.jsonc`
- Create: `apps/gateway/scripts/run-morning-todos.ts`

**Interfaces:**
- Consumes: `runMorningTodos`, `createMorningRepository`, `createDeepSeekTodoWriter`, `DEEPSEEK_TODO_DEFAULT_MODEL`, `createTaskRepository` from `@meld/gateway/core`.
- Produces: `handleScheduled(env: Env, deps?: { now?: () => Date; fetch?: typeof fetch }): Promise<void>`, plus `Env.DEEPSEEK_API_KEY?: string` and `Env.DEEPSEEK_TEXT_MODEL?: string`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/gateway-worker/src/scheduled.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const keepAlive = vi.fn().mockResolvedValue(30);
const runMorningTodos = vi.fn().mockResolvedValue([]);
vi.mock("@meld/gateway/core", () => ({
  createTaskRepository: () => ({ getAiTaskLeaseSeconds: keepAlive }),
  createMorningRepository: vi.fn(() => ({})),
  createDeepSeekTodoWriter: vi.fn(() => ({ model: "m", write: vi.fn() })),
  DEEPSEEK_TODO_DEFAULT_MODEL: "deepseek-flash",
  runMorningTodos,
}));
vi.mock("./env", () => ({ createSupabase: () => ({}) }));

import { handleScheduled } from "./scheduled";

const baseEnv = { GATEWAY_SUPABASE_URL: "u", GATEWAY_SUPABASE_SERVICE_ROLE_KEY: "k" } as never;

describe("handleScheduled", () => {
  beforeEach(() => { keepAlive.mockClear(); runMorningTodos.mockClear(); });

  it("always keeps Supabase awake", async () => {
    await handleScheduled(baseEnv);
    expect(keepAlive).toHaveBeenCalledOnce();
  });

  it("skips morning to-dos when no DeepSeek key is set", async () => {
    await handleScheduled(baseEnv);
    expect(runMorningTodos).not.toHaveBeenCalled();
  });

  it("runs morning to-dos when the key is set", async () => {
    const now = new Date("2026-11-10T06:17:00Z");
    await handleScheduled({ ...(baseEnv as object), DEEPSEEK_API_KEY: "secret" } as never, { now: () => now });
    expect(runMorningTodos).toHaveBeenCalledWith(expect.objectContaining({ now }));
  });

  it("does not throw when the morning run fails", async () => {
    runMorningTodos.mockRejectedValueOnce(new Error("boom"));
    await expect(handleScheduled({ ...(baseEnv as object), DEEPSEEK_API_KEY: "secret" } as never)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm --filter @meld/gateway-worker exec vitest run src/scheduled.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

In `apps/gateway-worker/src/env.ts`, add to `interface Env`:

```ts
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_TEXT_MODEL?: string;
```

Create `apps/gateway-worker/src/scheduled.ts`:

```ts
import {
  createDeepSeekTodoWriter,
  createMorningRepository,
  createTaskRepository,
  DEEPSEEK_TODO_DEFAULT_MODEL,
  runMorningTodos,
} from "@meld/gateway/core";
import { createSupabase, type Env } from "./env";

// Hourly. Keeps the free Supabase project awake, and writes the owner's
// morning to-dos once a day between 6:00 and 9:59 their time.
export async function handleScheduled(
  env: Env,
  deps: { now?: () => Date; fetch?: typeof fetch } = {},
): Promise<void> {
  const supabase = createSupabase(env);
  await createTaskRepository(supabase).getAiTaskLeaseSeconds();
  if (!env.DEEPSEEK_API_KEY) return;
  try {
    await runMorningTodos({
      repository: createMorningRepository(supabase as never),
      writer: createDeepSeekTodoWriter({
        apiKey: env.DEEPSEEK_API_KEY,
        model: env.DEEPSEEK_TEXT_MODEL || DEEPSEEK_TODO_DEFAULT_MODEL,
        fetch: deps.fetch,
      }),
      now: (deps.now ?? (() => new Date()))(),
    });
  } catch {
    console.error("morning to-dos run failed");
  }
}
```

Note: `fetch: deps.fetch` being `undefined` must fall back to `globalThis.fetch`. The writer's default parameter only applies to `undefined`, so this works.

In `apps/gateway-worker/src/index.ts`, replace the `scheduled` method:

```ts
  // Hourly: Supabase keep-alive + the owner's morning to-dos (see scheduled.ts).
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await handleScheduled(env);
  },
```
Add `import { handleScheduled } from "./scheduled";` and remove `createTaskRepository` from the `@meld/gateway/core` import only if nothing else in the file uses it (`fetch` still does, so keep it).

In `apps/gateway-worker/wrangler.jsonc`, change the cron:

```jsonc
  "triggers": { "crons": ["17 * * * *"] },
```

Then regenerate types: `pnpm --filter @meld/gateway-worker types`. Keep the `env.ts` interface as the source of truth.

- [ ] **Step 4: Create the manual runner for acceptance**

```ts
// apps/gateway/scripts/run-morning-todos.ts
// Owner-only acceptance run. Reads env, ignores the 6–9 window with --force.
// Usage: GATEWAY_SUPABASE_URL=… GATEWAY_SUPABASE_SERVICE_ROLE_KEY=… DEEPSEEK_API_KEY=… \
//   pnpm --filter @meld/gateway exec tsx scripts/run-morning-todos.ts --force
import { createClient } from "@supabase/supabase-js";
import { createDeepSeekTodoWriter, DEEPSEEK_TODO_DEFAULT_MODEL } from "../src/morning-todos/deepseek-todo-writer";
import { createMorningRepository, runMorningTodos } from "../src/morning-todos/run-morning-todos";

const url = process.env.GATEWAY_SUPABASE_URL;
const key = process.env.GATEWAY_SUPABASE_SERVICE_ROLE_KEY;
const apiKey = process.env.DEEPSEEK_API_KEY;
if (!url || !key || !apiKey) {
  console.error("Set GATEWAY_SUPABASE_URL, GATEWAY_SUPABASE_SERVICE_ROLE_KEY and DEEPSEEK_API_KEY.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const reports = await runMorningTodos({
  repository: createMorningRepository(supabase as never),
  writer: createDeepSeekTodoWriter({ apiKey, model: process.env.DEEPSEEK_TEXT_MODEL || DEEPSEEK_TODO_DEFAULT_MODEL }),
  now: new Date(),
  force: process.argv.includes("--force"),
});
console.log(JSON.stringify(reports, null, 2));
```

`--force` still respects the once-per-day claim. To re-run on the same day during acceptance, delete that day's row: `delete from public.morning_runs where local_date = '<date>';`.

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @meld/gateway-worker test && pnpm --filter @meld/gateway-worker typecheck && pnpm --filter @meld/gateway-worker build && pnpm test:colocation`
Expected: PASS. `build` is `wrangler deploy --dry-run` and proves the bundle resolves. `test:colocation` may require the script to have a test, or need `scripts/` excluded. If it flags `apps/gateway/scripts/run-morning-todos.ts`, check how `scripts/check-test-colocation.mjs` treats other `scripts/` folders and follow that.

- [ ] **Step 6: Commit**

```bash
git add apps/gateway-worker/src/scheduled.ts apps/gateway-worker/src/scheduled.test.ts apps/gateway-worker/src/env.ts apps/gateway-worker/src/index.ts apps/gateway-worker/wrangler.jsonc apps/gateway-worker/worker-configuration.d.ts apps/gateway/scripts/run-morning-todos.ts
git commit -m "feat(worker): hourly cron runs the morning to-dos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Web to-do store and server actions

**Files:**
- Create: `apps/web/src/features/todos/todo-store.ts`, `todo-store.test.ts`
- Create: `apps/web/src/features/todos/actions.ts`, `actions.test.ts`

**Interfaces:**
- Consumes: `TodoItemSchema`, `TodoItem`, `TodoStage` (Task 2), the Task 1 owner functions.
- Produces:
  - `type TodoRpcClient = { rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> }`
  - `readTodos(client, workspaceId): Promise<TodoItem[]>`
  - `writeTodo(client, { workspaceId, id, text, projectId, position }): Promise<void>`
  - `moveTodos(client, { workspaceId, ids, stage }): Promise<void>`
  - `deleteTodos(client, { workspaceId, ids }): Promise<void>`
  - `writeTimeZone(client, zone: string): Promise<void>`
  - Server actions in `actions.ts` (all return `TodoActionResult = { status: "ok" } | { status: "error"; message: string }` except `listTodos`):
    - `listTodos(workspaceId: string): Promise<TodoItem[]>`
    - `saveTodo(input: { workspaceId: string; id: string; text: string; projectId: string | null; position: number })`
    - `moveTodoItems(input: { workspaceId: string; ids: string[]; stage: TodoStage })`
    - `deleteTodoItems(input: { workspaceId: string; ids: string[] })`
    - `setTimeZone(zone: string)`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/features/todos/todo-store.test.ts
import { describe, expect, it, vi } from "vitest";
import { deleteTodos, moveTodos, readTodos, writeTimeZone, writeTodo } from "./todo-store";

const WS = "b2000000-0000-4000-8000-000000000001";
const ID = "b8000000-0000-4000-8000-000000000001";

const client = (data: unknown, error: { message: string } | null = null) => ({ rpc: vi.fn().mockResolvedValue({ data, error }) });

describe("todo-store", () => {
  it("reads and maps rows, dropping malformed ones", async () => {
    const c = client([
      { id: ID, project_id: null, text: "Ship it", stage: "in_progress", position: 1, created_at: "2026-11-10T06:00:00Z" },
      { id: "not-a-uuid", project_id: null, text: "x", stage: "todo", position: 2, created_at: "" },
    ]);
    await expect(readTodos(c, WS)).resolves.toEqual([
      { id: ID, projectId: null, text: "Ship it", stage: "in_progress", position: 1, createdAt: "2026-11-10T06:00:00Z" },
    ]);
    expect(c.rpc).toHaveBeenCalledWith("list_todo_items", { target_workspace_id: WS });
  });

  it("writes a line", async () => {
    const c = client(null);
    await writeTodo(c, { workspaceId: WS, id: ID, text: "Ship it", projectId: null, position: 3 });
    expect(c.rpc).toHaveBeenCalledWith("save_todo_item", {
      target_workspace_id: WS, item_id: ID, item_text: "Ship it", item_project_id: null, item_position: 3,
    });
  });

  it("moves lines between stages", async () => {
    const c = client(null);
    await moveTodos(c, { workspaceId: WS, ids: [ID], stage: "in_progress" });
    expect(c.rpc).toHaveBeenCalledWith("set_todo_stage", { target_workspace_id: WS, item_ids: [ID], new_stage: "in_progress" });
  });

  it("deletes lines", async () => {
    const c = client(null);
    await deleteTodos(c, { workspaceId: WS, ids: [ID] });
    expect(c.rpc).toHaveBeenCalledWith("delete_todo_items", { target_workspace_id: WS, item_ids: [ID] });
  });

  it("sets the time zone", async () => {
    const c = client(null);
    await writeTimeZone(c, "Africa/Lagos");
    expect(c.rpc).toHaveBeenCalledWith("set_my_time_zone", { zone: "Africa/Lagos" });
  });

  it("throws a friendly error on failure", async () => {
    await expect(readTodos(client(null, { message: "x" }), WS)).rejects.toThrow("We could not load your to-dos.");
  });
});
```

```ts
// apps/web/src/features/todos/actions.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { deleteTodoItems, moveTodoItems, saveTodo, setTimeZone } from "./actions";

const WS = "b2000000-0000-4000-8000-000000000001";
const ID = "b8000000-0000-4000-8000-000000000001";

describe("todo actions", () => {
  beforeEach(() => rpc.mockReset().mockResolvedValue({ data: null, error: null }));

  it("saves a valid line", async () => {
    await expect(saveTodo({ workspaceId: WS, id: ID, text: " Ship it ", projectId: null, position: 1 })).resolves.toEqual({ status: "ok" });
    expect(rpc).toHaveBeenCalledWith("save_todo_item", expect.objectContaining({ item_text: "Ship it" }));
  });

  it("refuses an empty line without calling the database", async () => {
    await expect(saveTodo({ workspaceId: WS, id: ID, text: "   ", projectId: null, position: 1 })).resolves.toMatchObject({ status: "error" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("moves lines", async () => {
    await expect(moveTodoItems({ workspaceId: WS, ids: [ID], stage: "done" })).resolves.toEqual({ status: "ok" });
    expect(rpc).toHaveBeenCalledWith("set_todo_stage", expect.objectContaining({ new_stage: "done" }));
  });

  it("refuses an unknown stage", async () => {
    await expect(moveTodoItems({ workspaceId: WS, ids: [ID], stage: "archived" as never })).resolves.toMatchObject({ status: "error" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns an error result when the database fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "nope" } });
    await expect(deleteTodoItems({ workspaceId: WS, ids: [ID] })).resolves.toEqual({
      status: "error", message: "We could not update your to-dos. Try again.",
    });
  });

  it("refuses a malformed time zone", async () => {
    await expect(setTimeZone("not a zone!")).resolves.toMatchObject({ status: "error" });
    expect(rpc).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm --filter web exec vitest run src/features/todos`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement `todo-store.ts`**

```ts
// apps/web/src/features/todos/todo-store.ts
import { TodoItemSchema, type TodoItem, type TodoStage } from "@meld/contracts";

export type TodoRpcClient = {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

const READ_ERROR = "We could not load your to-dos.";
const WRITE_ERROR = "We could not update your to-dos. Try again.";

type Row = { id: string; project_id: string | null; text: string; stage: string; position: number; created_at: string };

export async function readTodos(client: TodoRpcClient, workspaceId: string): Promise<TodoItem[]> {
  const { data, error } = await client.rpc("list_todo_items", { target_workspace_id: workspaceId });
  if (error) throw new Error(READ_ERROR);
  return ((Array.isArray(data) ? data : []) as Row[]).flatMap((row) => {
    const parsed = TodoItemSchema.safeParse({
      id: row.id, projectId: row.project_id, text: row.text, stage: row.stage,
      position: row.position, createdAt: row.created_at,
    });
    return parsed.success ? [parsed.data] : [];
  });
}

async function write(client: TodoRpcClient, fn: string, args: Record<string, unknown>) {
  const { error } = await client.rpc(fn, args);
  if (error) throw new Error(WRITE_ERROR);
}

export function writeTodo(
  client: TodoRpcClient,
  input: { workspaceId: string; id: string; text: string; projectId: string | null; position: number },
) {
  return write(client, "save_todo_item", {
    target_workspace_id: input.workspaceId, item_id: input.id, item_text: input.text,
    item_project_id: input.projectId, item_position: input.position,
  });
}

export function moveTodos(client: TodoRpcClient, input: { workspaceId: string; ids: string[]; stage: TodoStage }) {
  return write(client, "set_todo_stage", {
    target_workspace_id: input.workspaceId, item_ids: input.ids, new_stage: input.stage,
  });
}

export function deleteTodos(client: TodoRpcClient, input: { workspaceId: string; ids: string[] }) {
  return write(client, "delete_todo_items", { target_workspace_id: input.workspaceId, item_ids: input.ids });
}

export function writeTimeZone(client: TodoRpcClient, zone: string) {
  return write(client, "set_my_time_zone", { zone });
}
```

- [ ] **Step 4: Implement `actions.ts`**

```ts
// apps/web/src/features/todos/actions.ts
"use server";

import { TODO_TEXT_MAX, TodoStageSchema, type TodoItem } from "@meld/contracts";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { deleteTodos, moveTodos, readTodos, writeTimeZone, writeTodo, type TodoRpcClient } from "./todo-store";

export type TodoActionResult = { status: "ok" } | { status: "error"; message: string };

const WRITE_ERROR = "We could not update your to-dos. Try again.";
const failed: TodoActionResult = { status: "error", message: WRITE_ERROR };

const Uuid = z.string().uuid();
const Ids = z.array(Uuid).min(1).max(500);
const SaveSchema = z.object({
  workspaceId: Uuid,
  id: Uuid,
  text: z.string().trim().min(1).max(TODO_TEXT_MAX),
  projectId: Uuid.nullable(),
  position: z.number().finite(),
});
const MoveSchema = z.object({ workspaceId: Uuid, ids: Ids, stage: TodoStageSchema });
const DeleteSchema = z.object({ workspaceId: Uuid, ids: Ids });
const ZoneSchema = z.string().regex(/^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+){0,2}$/).max(64);

async function client(): Promise<TodoRpcClient> {
  return (await createClient(new Headers())) as unknown as TodoRpcClient;
}

async function attempt(run: () => Promise<void>): Promise<TodoActionResult> {
  try {
    await run();
    return { status: "ok" };
  } catch {
    return failed;
  }
}

export async function listTodos(workspaceId: string): Promise<TodoItem[]> {
  return readTodos(await client(), Uuid.parse(workspaceId));
}

export async function saveTodo(input: z.input<typeof SaveSchema>): Promise<TodoActionResult> {
  const parsed = SaveSchema.safeParse(input);
  if (!parsed.success) return failed;
  return attempt(async () => writeTodo(await client(), parsed.data));
}

export async function moveTodoItems(input: z.input<typeof MoveSchema>): Promise<TodoActionResult> {
  const parsed = MoveSchema.safeParse(input);
  if (!parsed.success) return failed;
  return attempt(async () => moveTodos(await client(), parsed.data));
}

export async function deleteTodoItems(input: z.input<typeof DeleteSchema>): Promise<TodoActionResult> {
  const parsed = DeleteSchema.safeParse(input);
  if (!parsed.success) return failed;
  return attempt(async () => deleteTodos(await client(), parsed.data));
}

export async function setTimeZone(zone: string): Promise<TodoActionResult> {
  const parsed = ZoneSchema.safeParse(zone);
  if (!parsed.success) return failed;
  return attempt(async () => writeTimeZone(await client(), parsed.data));
}
```

If the web e2e "room fake" mode (`isRoomFakeEnabled`) needs a to-do fake for Playwright, follow how `features/activity` handles it; if activity has no fake, don't add one.

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter web exec vitest run src/features/todos && pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/todos/todo-store.ts apps/web/src/features/todos/todo-store.test.ts apps/web/src/features/todos/actions.ts apps/web/src/features/todos/actions.test.ts
git commit -m "feat(web): saved to-do store and server actions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Web Overview: Todo, In progress and Completed replace Needs you

**Files:**
- Create: `apps/web/src/features/todos/components/todo-section.tsx`, `todo-section.test.tsx`
- Modify: `apps/web/src/app/(app)/[workspaceId]/page.tsx`, `page.test.tsx`
- Delete: `apps/web/src/features/activity/components/needs-you-list.tsx`, `needs-you-list.test.tsx`

**Interfaces:**
- Consumes: `listTodos`, `saveTodo`, `moveTodoItems`, `deleteTodoItems` (Task 7), `TodoItem` (Task 2).
- Produces: `<TodoSection workspaceId={string} projects={{ id: string; name: string }[]} initialTodos={TodoItem[]} />`

Behaviour (mirrors the Mac Overview):
- **Todo**: each line has a checkbox (selects for Orchestrate), a text field, a project menu and a delete button. The last line is always a blank "Add a to-do" input. Enter on a filled line saves it and focuses a new blank line. Changing the project of a saved line saves right away. **Orchestrate** (shown only when something is ticked) moves the ticked lines to `in_progress`.
- **In progress**: read-only rows (text + project name), each with a **Mark done** button that moves it to `done`. Hidden when empty.
- **Completed**: read-only rows, collapsed by default behind a "Completed · N" toggle. Hidden when empty.
- Optimistic: update local state first, call the action, and on an error result put the old state back and show the message.

- [ ] **Step 1: Look up the Astryx components before writing JSX**

```bash
cd apps/web
pnpm exec astryx component ListItem
pnpm exec astryx component CheckboxInput
pnpm exec astryx component DropdownMenu
pnpm exec astryx component IconButton
pnpm exec astryx search "collapsible disclosure"
pnpm exec astryx docs icons | head -60
```
Use exactly the props these print. The JSX below assumes `CheckboxInput {label,isLabelHidden,value,onChange,isDisabled}`, `TextInput {label,isLabelHidden,value,onChange,placeholder}`, `DropdownMenu {trigger, items}` and `IconButton {label, icon, onClick}`. Adjust names to match the CLI output. If Astryx has a disclosure/collapsible component, use it for Completed instead of the Button toggle.

- [ ] **Step 2: Write the failing component test**

```tsx
// apps/web/src/features/todos/components/todo-section.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const saveTodo = vi.fn();
const moveTodoItems = vi.fn();
const deleteTodoItems = vi.fn();
vi.mock("../actions", () => ({
  saveTodo: (...a: unknown[]) => saveTodo(...a),
  moveTodoItems: (...a: unknown[]) => moveTodoItems(...a),
  deleteTodoItems: (...a: unknown[]) => deleteTodoItems(...a),
}));

import { TodoSection } from "./todo-section";

const WS = "b2000000-0000-4000-8000-000000000001";
const P1 = "b7000000-0000-4000-8000-000000000001";
const line = (id: string, text: string, stage: "todo" | "in_progress" | "done", position: number) =>
  ({ id: `b8000000-0000-4000-8000-00000000000${id}`, projectId: P1, text, stage, position, createdAt: "" });
const todo = line("1", "Draft pricing", "todo", 1);
const working = line("2", "Build onboarding", "in_progress", 2);
const done = line("3", "Write the PRD", "done", 3);

describe("TodoSection", () => {
  beforeEach(() => {
    for (const fn of [saveTodo, moveTodoItems, deleteTodoItems]) fn.mockReset().mockResolvedValue({ status: "ok" });
  });

  it("shows the three lists, with Completed collapsed", async () => {
    render(<TodoSection workspaceId={WS} projects={[{ id: P1, name: "Mark" }]} initialTodos={[todo, working, done]} />);
    expect(screen.getByDisplayValue("Draft pricing")).toBeInTheDocument();
    expect(screen.getByText("Build onboarding")).toBeInTheDocument();
    expect(screen.queryByText("Write the PRD")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Completed · 1" }));
    expect(screen.getByText("Write the PRD")).toBeInTheDocument();
    expect(screen.getAllByPlaceholderText("Add a to-do")).toHaveLength(1);
  });

  it("saves a new line on Enter", async () => {
    render(<TodoSection workspaceId={WS} projects={[]} initialTodos={[]} />);
    await userEvent.type(screen.getByPlaceholderText("Add a to-do"), "Ship it{Enter}");
    expect(saveTodo).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: WS, text: "Ship it", projectId: null, position: 1 }));
  });

  it("orchestrates ticked lines into In progress", async () => {
    render(<TodoSection workspaceId={WS} projects={[]} initialTodos={[todo]} />);
    expect(screen.queryByRole("button", { name: "Orchestrate" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Draft pricing" }));
    await userEvent.click(screen.getByRole("button", { name: "Orchestrate" }));
    expect(moveTodoItems).toHaveBeenCalledWith({ workspaceId: WS, ids: [todo.id], stage: "in_progress" });
    expect(screen.getByText("Draft pricing")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Draft pricing")).not.toBeInTheDocument();
  });

  it("marks an in-progress line done", async () => {
    render(<TodoSection workspaceId={WS} projects={[]} initialTodos={[working]} />);
    await userEvent.click(screen.getByRole("button", { name: "Mark Build onboarding done" }));
    expect(moveTodoItems).toHaveBeenCalledWith({ workspaceId: WS, ids: [working.id], stage: "done" });
  });

  it("deletes a todo line, and puts it back when that fails", async () => {
    deleteTodoItems.mockResolvedValue({ status: "error", message: "We could not update your to-dos. Try again." });
    render(<TodoSection workspaceId={WS} projects={[]} initialTodos={[todo]} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete to-do" }));
    expect(deleteTodoItems).toHaveBeenCalledWith({ workspaceId: WS, ids: [todo.id] });
    expect(await screen.findByDisplayValue("Draft pricing")).toBeInTheDocument();
    expect(screen.getByText("We could not update your to-dos. Try again.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `pnpm --filter web exec vitest run src/features/todos/components`
Expected: FAIL (module missing).

- [ ] **Step 4: Implement `todo-section.tsx`**

```tsx
// apps/web/src/features/todos/components/todo-section.tsx
"use client";

import type { TodoItem, TodoStage } from "@meld/contracts";
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import { List } from "@astryxdesign/core/List";
import { ListItem } from "@astryxdesign/core/ListItem";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useState } from "react";
import { deleteTodoItems, moveTodoItems, saveTodo, type TodoActionResult } from "../actions";

type Project = { id: string; name: string };
type Line = { id: string; text: string; projectId: string | null; stage: TodoStage; position: number; saved: boolean };

const toLine = (item: TodoItem): Line => ({ ...item, saved: true });
const blank = (position: number): Line => ({ id: crypto.randomUUID(), text: "", projectId: null, stage: "todo", position, saved: false });
const nextPosition = (lines: Line[]) => Math.max(0, ...lines.map((line) => line.position)) + 1;

export function TodoSection({
  workspaceId,
  projects,
  initialTodos,
}: {
  workspaceId: string;
  projects: Project[];
  initialTodos: TodoItem[];
}) {
  const [lines, setLines] = useState<Line[]>(() => {
    const saved = initialTodos.map(toLine);
    return [...saved, blank(nextPosition(saved))];
  });
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [showCompleted, setShowCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const todo = lines.filter((l) => l.stage === "todo");
  const inProgress = lines.filter((l) => l.stage === "in_progress");
  const completed = lines.filter((l) => l.stage === "done").reverse();
  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name;

  async function optimistic(change: (current: Line[]) => Line[], call: () => Promise<TodoActionResult>) {
    const before = lines;
    setLines(change);
    const result = await call();
    if (result.status === "error") { setLines(before); setError(result.message); } else setError(null);
  }

  function commit(line: Line) {
    const text = line.text.trim();
    if (!text) return;
    void optimistic(
      (current) => {
        const updated = current.map((l) => (l.id === line.id ? { ...line, text, saved: true } : l));
        return updated.some((l) => l.stage === "todo" && !l.text.trim()) ? updated : [...updated, blank(nextPosition(updated))];
      },
      () => saveTodo({ workspaceId, id: line.id, text, projectId: line.projectId, position: line.position }),
    );
  }

  function move(ids: string[], stage: TodoStage) {
    setChecked(new Set());
    void optimistic(
      (current) => current.map((l) => (ids.includes(l.id) ? { ...l, stage } : l)),
      () => moveTodoItems({ workspaceId, ids, stage }),
    );
  }

  function remove(id: string) {
    void optimistic((current) => current.filter((l) => l.id !== id), () => deleteTodoItems({ workspaceId, ids: [id] }));
  }

  function setProject(line: Line, projectId: string | null) {
    const updated = { ...line, projectId };
    setLines((current) => current.map((l) => (l.id === line.id ? updated : l)));
    if (line.saved) commit(updated);
  }

  const readOnlyRow = (line: Line, action?: React.ReactNode) => (
    <ListItem key={line.id}>
      <HStack gap={3} align="center" width="100%">
        <Text>{line.text}</Text>
        {projectName(line.projectId) ? <Text color="secondary">{projectName(line.projectId)}</Text> : null}
        {action}
      </HStack>
    </ListItem>
  );

  return (
    <VStack gap={6} width="100%">
      <VStack gap={3} width="100%">
        <HStack justify="between" align="center">
          <Text as="h2" variant="title-sm">Todo</Text>
          {checked.size > 0 ? (
            <Button variant="primary" onClick={() => move([...checked], "in_progress")}>Orchestrate</Button>
          ) : null}
        </HStack>
        {error ? <Text color="danger">{error}</Text> : null}
        <List density="compact">
          {todo.map((line) => (
            <ListItem key={line.id}>
              <HStack gap={3} align="center" width="100%">
                <CheckboxInput
                  label={line.text ? `Select ${line.text}` : "Select to-do"}
                  isLabelHidden
                  value={checked.has(line.id)}
                  isDisabled={!line.saved}
                  onChange={(value: boolean) =>
                    setChecked((current) => {
                      const next = new Set(current);
                      if (value) next.add(line.id); else next.delete(line.id);
                      return next;
                    })
                  }
                />
                <TextInput
                  label="To-do"
                  isLabelHidden
                  placeholder="Add a to-do"
                  value={line.text}
                  onChange={(text: string) => setLines((current) => current.map((l) => (l.id === line.id ? { ...l, text } : l)))}
                  onKeyDown={(event: React.KeyboardEvent) => { if (event.key === "Enter") commit(line); }}
                />
                <DropdownMenu
                  trigger={<Button variant="ghost" size="sm">{projectName(line.projectId) ?? "Project"}</Button>}
                  items={[
                    { label: "No project", onClick: () => setProject(line, null) },
                    ...projects.map((p) => ({ label: p.name, onClick: () => setProject(line, p.id) })),
                  ]}
                />
                {line.saved ? (
                  <IconButton label="Delete to-do" icon="trash" variant="ghost" onClick={() => remove(line.id)} />
                ) : null}
              </HStack>
            </ListItem>
          ))}
        </List>
      </VStack>

      {inProgress.length > 0 ? (
        <VStack gap={3} width="100%">
          <Text as="h2" variant="title-sm">In progress</Text>
          <List density="compact">
            {inProgress.map((line) =>
              readOnlyRow(line, (
                <Button variant="ghost" size="sm" aria-label={`Mark ${line.text} done`} onClick={() => move([line.id], "done")}>
                  Mark done
                </Button>
              )),
            )}
          </List>
        </VStack>
      ) : null}

      {completed.length > 0 ? (
        <VStack gap={3} width="100%">
          <Button variant="ghost" onClick={() => setShowCompleted((open) => !open)}>
            {`Completed · ${completed.length}`}
          </Button>
          {showCompleted ? <List density="compact">{completed.map((line) => readOnlyRow(line))}</List> : null}
        </VStack>
      ) : null}
    </VStack>
  );
}
```

Fix prop names to match Step 1's CLI output (for example `TextInput` might not forward `onKeyDown`; if not, check `astryx component TextInput` for a submit/keyboard prop or wrap in a `form` with `onSubmit`; `Button` may take `label` instead of `aria-label`). Keep the accessible names used in the test.

- [ ] **Step 5: Wire it into the Overview page**

In `apps/web/src/app/(app)/[workspaceId]/page.tsx`:
- remove the imports of `NeedsYouList` and `listAttentionItems`, and the `attentionItems` lines plus their comment
- add `import { TodoSection } from "@/features/todos/components/todo-section";` and `import { listTodos } from "@/features/todos/actions";`
- add `listTodos(workspaceId).catch(() => [])` to the `Promise.all` (name it `todos`)
- replace the `<NeedsYouList … />` element with:

```tsx
              <TodoSection
                workspaceId={workspaceId}
                projects={projects.map(({ id, name }) => ({ id, name }))}
                initialTodos={todos}
              />
```

Update `page.test.tsx`: remove the Needs-you expectations and mocks, mock `@/features/todos/actions` (`listTodos` resolving `[]`), and assert the heading "Todo" renders when there are projects.

Delete `apps/web/src/features/activity/components/needs-you-list.tsx` and `needs-you-list.test.tsx`. Then:

```bash
grep -rn "listAttentionItems\|needs-attention\|NeedsAttention" apps/web/src
```
If `listAttentionItems` (`features/home/actions.ts`) and `features/home/components/needs-attention.tsx` have no remaining importers outside their own tests, delete them and their tests. Otherwise leave them.

- [ ] **Step 6: Run the checks**

Run: `pnpm --filter web exec vitest run src/features/todos "src/app/(app)/[workspaceId]/page.test.tsx" && pnpm --filter web typecheck && pnpm --filter web lint && pnpm check:astryx && pnpm test:colocation`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/todos/components "apps/web/src/app/(app)/[workspaceId]/page.tsx" "apps/web/src/app/(app)/[workspaceId]/page.test.tsx"
git add -u apps/web/src/features/activity apps/web/src/features/home
git commit -m "feat(web): Overview Todo, In progress and Completed replace Needs you

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Bridge: to-dos in the snapshot and to-do handlers

**Files:**
- Modify: `apps/web/src/features/native/bridge.ts`
- Modify: `apps/web/src/features/native/native-frame-bridge.tsx`, `native-frame-bridge.test.tsx`
- Modify: `apps/web/src/app/(app)/[workspaceId]/layout.tsx`

**Interfaces:**
- Consumes: `listTodos`, `saveTodo`, `moveTodoItems`, `deleteTodoItems`, `setTimeZone` (Task 7).
- Produces (wire format, consumed by Task 10):
  - `FrameSnapshot.todos: { id: string; projectId: string | null; text: string; stage: "todo" | "in_progress" | "done"; position: number }[]`
  - `FrameHandlers.saveTodo(input: { id: string; text: string; projectId: string | null; position: number }) => Promise<FrameResult>`
  - `FrameHandlers.moveTodos(ids: string[], stage: "todo" | "in_progress" | "done") => Promise<FrameResult>`
  - `FrameHandlers.deleteTodos(ids: string[]) => Promise<FrameResult>`
  - `FrameHandlers.setTimeZone(zone: string) => Promise<FrameResult>`
  - `NativeFrameBridge` gets a `todos` prop.

- [ ] **Step 1: Write the failing tests**

Add to `native-frame-bridge.test.tsx`, following the file's existing render and mocking setup (read it first; it already mocks `@/features/projects/actions` and captures `postToNative`/`registerFrameHandlers`):

```tsx
vi.mock("@/features/todos/actions", () => ({
  saveTodo: vi.fn().mockResolvedValue({ status: "ok" }),
  moveTodoItems: vi.fn().mockResolvedValue({ status: "ok" }),
  deleteTodoItems: vi.fn().mockResolvedValue({ status: "ok" }),
  setTimeZone: vi.fn().mockResolvedValue({ status: "ok" }),
}));

it("posts to-dos in the frame snapshot", () => {
  renderBridge({ todos: [{ id: "t1", projectId: null, text: "Ship it", stage: "in_progress", position: 1 }] });
  expect(lastPosted()).toMatchObject({ type: "frame", todos: [{ id: "t1", text: "Ship it", stage: "in_progress" }] });
});

it("saves, moves, deletes and sets the time zone through the page actions", async () => {
  const { saveTodo, moveTodoItems, deleteTodoItems, setTimeZone } = await import("@/features/todos/actions");
  renderBridge({ todos: [] });
  const handlers = registeredHandlers();
  await expect(handlers.saveTodo({ id: "t1", text: "Ship it", projectId: null, position: 1 })).resolves.toEqual({ status: "ok" });
  expect(saveTodo).toHaveBeenCalledWith({ workspaceId: WORKSPACE_ID, id: "t1", text: "Ship it", projectId: null, position: 1 });
  await handlers.moveTodos(["t1"], "in_progress");
  expect(moveTodoItems).toHaveBeenCalledWith({ workspaceId: WORKSPACE_ID, ids: ["t1"], stage: "in_progress" });
  await handlers.deleteTodos(["t1"]);
  expect(deleteTodoItems).toHaveBeenCalledWith({ workspaceId: WORKSPACE_ID, ids: ["t1"] });
  await handlers.setTimeZone("Africa/Lagos");
  expect(setTimeZone).toHaveBeenCalledWith("Africa/Lagos");
});
```
`renderBridge`, `lastPosted`, `registeredHandlers` and `WORKSPACE_ID` stand for whatever helpers the existing test file already uses. If it inlines them, inline the same way. Don't invent a second harness.

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm --filter web exec vitest run src/features/native/native-frame-bridge.test.tsx`
Expected: FAIL (`todos` missing from the snapshot, handlers undefined).

- [ ] **Step 3: Implement**

In `bridge.ts`:

```ts
export type FrameTodoStage = "todo" | "in_progress" | "done";
export type FrameTodo = { id: string; projectId: string | null; text: string; stage: FrameTodoStage; position: number };

// in FrameSnapshot:
  todos: FrameTodo[];

// in FrameHandlers:
  saveTodo: (input: Omit<FrameTodo, "stage">) => Promise<FrameResult>;
  moveTodos: (ids: string[], stage: FrameTodoStage) => Promise<FrameResult>;
  deleteTodos: (ids: string[]) => Promise<FrameResult>;
  setTimeZone: (zone: string) => Promise<FrameResult>;
```

In `native-frame-bridge.tsx`:
- Props become `Omit<FrameSnapshot, "path" | "activity">` (now including `todos`). Add `todos` to the `snapshot` `useMemo` object and its dependency list.
- `import { deleteTodoItems, moveTodoItems, saveTodo, setTimeZone } from "@/features/todos/actions";`
- Inside `registerFrameHandlers({ … })` add:

```ts
      saveTodo: (input) =>
        run(async () => {
          const result = await saveTodo({ workspaceId, ...input });
          return result.status === "ok" ? { status: "ok" } : result;
        }),
      moveTodos: (ids, stage) =>
        run(async () => {
          const result = await moveTodoItems({ workspaceId, ids, stage });
          return result.status === "ok" ? { status: "ok" } : result;
        }),
      deleteTodos: (ids) =>
        run(async () => {
          const result = await deleteTodoItems({ workspaceId, ids });
          return result.status === "ok" ? { status: "ok" } : result;
        }),
      setTimeZone: async (zone) => {
        try {
          const result = await setTimeZone(zone);
          return result.status === "ok" ? { status: "ok" } : result;
        } catch {
          return FAILED;
        }
      },
```
(`setTimeZone` doesn't need `router.refresh()`.)

In `layout.tsx`, after `isNativeFrame` is known:

```ts
  const todos = isNativeFrame ? await listTodos(workspaceId).catch(() => []) : [];
```
with `import { listTodos } from "@/features/todos/actions";`. Pass it to the bridge:

```tsx
              todos={todos.map(({ id, projectId, text, stage, position }) => ({ id, projectId, text, stage, position }))}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter web exec vitest run src/features/native && pnpm --filter web typecheck && pnpm --filter web lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/native/bridge.ts apps/web/src/features/native/native-frame-bridge.tsx apps/web/src/features/native/native-frame-bridge.test.tsx "apps/web/src/app/(app)/[workspaceId]/layout.tsx"
git commit -m "feat(web): send to-dos to the native frame and accept to-do commands

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Mac: saved Todo, In progress and Completed, and time zone reporting

**Files:**
- Modify: `apps/mac/Sources/OrionAppCore/Frame/FrameSnapshot.swift`
- Modify: `apps/mac/Tests/OrionAppCoreTests/FrameTests.swift`
- Modify: `apps/mac/Sources/Orion/Frame/FrameModel.swift`
- Modify: `apps/mac/Sources/Orion/Frame/OverviewTodoStore.swift`, `OverviewPage.swift`
- Modify: `apps/mac/Tests/OrionTests/OverviewTodoStoreTests.swift`

**Interfaces:**
- Consumes: the Task 9 wire format.
- Produces:
  - `public enum FrameTodoStage: String, Sendable { case todo, inProgress = "in_progress", done }`
  - `public struct FrameTodo: Equatable, Sendable, Identifiable { public let id: String; public let projectID: String?; public let text: String; public let stage: FrameTodoStage; public let position: Double }`
  - `FrameSnapshot.todos: [FrameTodo]` (sorted by position)
  - `@MainActor protocol TodoSyncing: AnyObject { func saveTodo(_ item: FrameTodo) async -> Bool; func moveTodos(_ ids: [String], to stage: FrameTodoStage) async -> Bool; func deleteTodos(_ ids: [String]) async -> Bool }`
  - `FrameModel: TodoSyncing`, plus `func reportTimeZone() async`
  - `OverviewTodoStore.apply(_ saved: [FrameTodo])` and `weak var sync: TodoSyncing?`. `OverviewTodoItem` gains `isSaved: Bool` and `position: Double`.

Before starting, read the current `OverviewTodoStore.swift`, `OverviewPage.swift` and `OverviewTodoStoreTests.swift` in full. They're uncommitted work on this branch: keep every existing behaviour and test (blank trailing line, Enter commits, project per line, remembered last project, `removeChecked`, Orchestrate → `inProgress`, `completeInProgress` → `completed`, read-only In progress/Completed rows) and add saving on top. If the files have changed again since this plan was written, adapt the hooks below to the new method names. The rule stays the same: every move between lists calls `moveTodos`, and every removal calls `deleteTodos`.

- [ ] **Step 1: Write the failing snapshot test**

Add to `apps/mac/Tests/OrionAppCoreTests/FrameTests.swift` (match the file's existing style for building the `fields` dictionary):

```swift
@Test func decodesTodosSortedByPosition() {
    let fields: [String: Any] = [
        "workspaceId": "w1", "path": "/w1", "projects": [], "tabs": [], "hasTasteUpdates": false,
        "todos": [
            ["id": "b", "projectId": NSNull(), "text": "Second", "stage": "in_progress", "position": 2.0],
            ["id": "a", "projectId": "p1", "text": "First", "stage": "todo", "position": 1],
            ["id": "c", "text": "", "stage": "todo"],                  // dropped: empty text
            ["text": "No id", "stage": "todo", "position": 3],          // dropped: no id
            ["id": "d", "text": "Odd", "stage": "archived", "position": 4], // dropped: unknown stage
        ],
    ]
    let snapshot = FrameSnapshot.decode(fields)
    #expect(snapshot?.todos == [
        FrameTodo(id: "a", projectID: "p1", text: "First", stage: .todo, position: 1),
        FrameTodo(id: "b", projectID: nil, text: "Second", stage: .inProgress, position: 2),
    ])
}

@Test func missingTodosDecodeAsEmpty() {
    let fields: [String: Any] = ["workspaceId": "w1", "path": "/w1"]
    #expect(FrameSnapshot.decode(fields)?.todos == [])
}
```

- [ ] **Step 2: Write the failing store tests**

Add to `apps/mac/Tests/OrionTests/OverviewTodoStoreTests.swift`:

```swift
@MainActor
final class FakeTodoSync: TodoSyncing {
    var saved: [FrameTodo] = []
    var moved: [([String], FrameTodoStage)] = []
    var deleted: [[String]] = []
    func saveTodo(_ item: FrameTodo) async -> Bool { saved.append(item); return true }
    func moveTodos(_ ids: [String], to stage: FrameTodoStage) async -> Bool { moved.append((ids, stage)); return true }
    func deleteTodos(_ ids: [String]) async -> Bool { deleted.append(ids); return true }
}

@MainActor
struct OverviewTodoSyncTests {
    private func wire(_ id: UUID) -> String { id.uuidString.lowercased() }

    @Test func applySplitsSavedLinesIntoTheThreeLists() {
        let store = OverviewTodoStore(items: nil)
        let a = UUID(), b = UUID(), c = UUID()
        store.apply([
            FrameTodo(id: wire(a), projectID: "p1", text: "Draft pricing", stage: .todo, position: 1),
            FrameTodo(id: wire(b), projectID: nil, text: "Build onboarding", stage: .inProgress, position: 2),
            FrameTodo(id: wire(c), projectID: nil, text: "Write the PRD", stage: .done, position: 3),
        ])
        #expect(store.items.map(\.text) == ["Draft pricing", ""])
        #expect(store.items[0].isSaved)
        #expect(store.inProgress.map(\.text) == ["Build onboarding"])
        #expect(store.completed.map(\.text) == ["Write the PRD"])
    }

    @Test func commitSavesTheLine() async {
        let store = OverviewTodoStore(items: nil)
        let sync = FakeTodoSync()
        store.sync = sync
        let first = store.items[0].id
        store.setText("Ship it", for: first)
        _ = store.commitLine(first)
        await store.pendingSync?.value
        #expect(sync.saved.map(\.text) == ["Ship it"])
        #expect(sync.saved.first?.id == wire(first))
        #expect(store.items[0].isSaved)
    }

    @Test func applyNeverOverwritesALineBeingEdited() {
        let store = OverviewTodoStore(items: nil)
        let id = UUID()
        store.apply([FrameTodo(id: wire(id), projectID: nil, text: "Old", stage: .todo, position: 1)])
        store.setText("Typing…", for: id)
        store.apply([FrameTodo(id: wire(id), projectID: nil, text: "Old", stage: .todo, position: 1)])
        #expect(store.items[0].text == "Typing…")
    }

    @Test func orchestrateMovesSavedLinesToInProgress() async {
        let store = OverviewTodoStore(items: nil)
        let sync = FakeTodoSync()
        store.sync = sync
        let id = UUID()
        store.apply([FrameTodo(id: wire(id), projectID: nil, text: "Ship it", stage: .todo, position: 1)])
        store.toggleChecked(id)
        #expect(store.orchestrateChecked() == 1)
        await store.pendingSync?.value
        #expect(sync.moved.first?.0 == [wire(id)])
        #expect(sync.moved.first?.1 == .inProgress)
    }

    @Test func completingMovesToDone() async {
        let store = OverviewTodoStore(items: nil)
        let sync = FakeTodoSync()
        store.sync = sync
        let id = UUID()
        store.apply([FrameTodo(id: wire(id), projectID: nil, text: "Ship it", stage: .inProgress, position: 1)])
        store.completeInProgress(id)
        await store.pendingSync?.value
        #expect(sync.moved.first?.1 == .done)
        #expect(store.completed.map(\.text) == ["Ship it"])
    }

    @Test func removeDeletesASavedLine() async {
        let store = OverviewTodoStore(items: nil)
        let sync = FakeTodoSync()
        store.sync = sync
        let id = UUID()
        store.apply([FrameTodo(id: wire(id), projectID: nil, text: "Ship it", stage: .todo, position: 1)])
        store.remove(id)
        await store.pendingSync?.value
        #expect(sync.deleted == [[wire(id)]])
    }
}
```
If `OverviewTodoStore`'s initializer reads `UserDefaults` for the last project, the tests still work. If that makes them flaky, inject a `UserDefaults(suiteName:)` the way the existing tests do (or add the parameter if they don't).

- [ ] **Step 3: Run them and confirm they fail**

Run: `cd apps/mac && swift test --filter "FrameTests|OverviewTodo"`
Expected: compile errors (`FrameTodo`, `TodoSyncing`, `apply`, `sync`, `pendingSync` don't exist).

- [ ] **Step 4: Implement the snapshot**

In `FrameSnapshot.swift`, add:

```swift
public enum FrameTodoStage: String, Sendable {
    case todo
    case inProgress = "in_progress"
    case done
}

/// One saved Overview to-do line, as posted by the page.
public struct FrameTodo: Equatable, Sendable, Identifiable {
    public let id: String
    public let projectID: String?
    public let text: String
    public let stage: FrameTodoStage
    public let position: Double

    public init(id: String, projectID: String?, text: String, stage: FrameTodoStage, position: Double) {
        self.id = id
        self.projectID = projectID
        self.text = text
        self.stage = stage
        self.position = position
    }
}
```
Add `public let todos: [FrameTodo]` to `FrameSnapshot`, with an init parameter `todos: [FrameTodo] = []`. In `decode`:

```swift
        let todos = (fields["todos"] as? [[String: Any]] ?? []).prefix(maxItems).compactMap { row -> FrameTodo? in
            guard let id = row["id"] as? String, !id.isEmpty,
                  let text = row["text"] as? String,
                  !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  let stage = (row["stage"] as? String).flatMap(FrameTodoStage.init(rawValue:)) else { return nil }
            let position = (row["position"] as? NSNumber)?.doubleValue ?? 0
            return FrameTodo(id: id, projectID: row["projectId"] as? String, text: text, stage: stage, position: position)
        }.sorted { $0.position == $1.position ? $0.id < $1.id : $0.position < $1.position }
```
and pass `todos: todos` to the init.

- [ ] **Step 5: Implement sync in `FrameModel`**

Add to `OverviewTodoStore.swift` (top level):

```swift
@MainActor
protocol TodoSyncing: AnyObject {
    func saveTodo(_ item: FrameTodo) async -> Bool
    func moveTodos(_ ids: [String], to stage: FrameTodoStage) async -> Bool
    func deleteTodos(_ ids: [String]) async -> Bool
}
```

At the bottom of `FrameModel.swift` (same file, so `private perform` is reachable), add:

```swift
extension FrameModel: TodoSyncing {
    func saveTodo(_ item: FrameTodo) async -> Bool {
        let arguments: [String: any Sendable] = [
            "id": item.id, "text": item.text, "position": item.position,
            "projectId": item.projectID ?? NSNull(),
        ]
        return await perform(
            "const f = window.__orionFrame; return f ? await f.saveTodo({ id, text, projectId, position }) : null;",
            arguments: arguments
        )
    }

    func moveTodos(_ ids: [String], to stage: FrameTodoStage) async -> Bool {
        await perform(
            "const f = window.__orionFrame; return f ? await f.moveTodos(ids, stage) : null;",
            arguments: ["ids": ids, "stage": stage.rawValue]
        )
    }

    func deleteTodos(_ ids: [String]) async -> Bool {
        await perform(
            "const f = window.__orionFrame; return f ? await f.deleteTodos(ids) : null;",
            arguments: ["ids": ids]
        )
    }

    /// Tell the page which time zone the owner is in, for the 6 am to-dos.
    func reportTimeZone() async {
        guard let commander else { return }
        _ = await commander.callFrame(
            "const f = window.__orionFrame; return f && f.setTimeZone ? await f.setTimeZone(zone) : null;",
            arguments: ["zone": TimeZone.current.identifier]
        )
    }
}
```
`callAsyncJavaScript` maps `NSNull` to JS `null`. In `update(_:)`, report the zone once per launch:

```swift
    @ObservationIgnored private var didReportTimeZone = false
    // at the end of update(_:):
        if !didReportTimeZone {
            didReportTimeZone = true
            Task { await reportTimeZone() }
        }
```
and observe changes (add an `init()` if `FrameModel` has none):

```swift
    @ObservationIgnored private var timeZoneObserver: (any NSObjectProtocol)?
    // in init():
        timeZoneObserver = NotificationCenter.default.addObserver(
            forName: .NSSystemTimeZoneDidChange, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in await self?.reportTimeZone() }
        }
```

- [ ] **Step 6: Implement sync in `OverviewTodoStore`**

Mark `OverviewTodoStore` `@MainActor` (it's only used from views; mark the existing test structs `@MainActor` too if the compiler asks). Then add:

```swift
// OverviewTodoItem: add
    var isSaved: Bool = false
    var position: Double = 0

// OverviewTodoStore: add
    @ObservationIgnored weak var sync: TodoSyncing?
    /// The latest save/move/delete, so tests (and callers) can await it.
    @ObservationIgnored private(set) var pendingSync: Task<Void, Never>?
    /// Lines with local edits not yet committed; snapshots never overwrite them.
    @ObservationIgnored private var editing: Set<UUID> = []

    private static func wireID(_ id: UUID) -> String { id.uuidString.lowercased() }

    private var nextPosition: Double {
        ((items + inProgress + completed).map(\.position).max() ?? 0) + 1
    }

    /// Merge saved lines from the page into the three lists. Keeps unsaved and in-progress edits.
    func apply(_ saved: [FrameTodo]) {
        func item(_ todo: FrameTodo) -> OverviewTodoItem? {
            guard let id = UUID(uuidString: todo.id) else { return nil }
            if todo.stage == .todo, editing.contains(id), let local = items.first(where: { $0.id == id }) { return local }
            let isChecked = items.first(where: { $0.id == id })?.isChecked ?? false
            var line = OverviewTodoItem(id: id, text: todo.text, isChecked: todo.stage == .todo && isChecked, projectID: todo.projectID)
            line.isSaved = true
            line.position = todo.position
            return line
        }
        let todoLines = saved.filter { $0.stage == .todo }.compactMap(item)
        let savedIDs = Set(saved.compactMap { UUID(uuidString: $0.id) })
        items = todoLines + items.filter { !$0.isSaved && !savedIDs.contains($0.id) && !$0.isBlank }
        inProgress = saved.filter { $0.stage == .inProgress }.compactMap(item).map { $0.asReadOnlyKeepingSync() }
        completed = saved.filter { $0.stage == .done }.reversed().compactMap(item).map { $0.asReadOnlyKeepingSync() }
        ensureTrailingBlank()
    }

    private func save(_ index: Int) {
        let line = items[index]
        guard !line.isBlank else { return }
        if line.position == 0 { items[index].position = nextPosition }
        items[index].isSaved = true
        editing.remove(line.id)
        let todo = FrameTodo(id: Self.wireID(line.id), projectID: line.projectID, text: line.text, stage: .todo, position: items[index].position)
        guard let sync else { return }
        pendingSync = Task { _ = await sync.saveTodo(todo) }
    }

    private func sendMove(_ ids: [UUID], to stage: FrameTodoStage) {
        guard let sync, !ids.isEmpty else { return }
        let wire = ids.map(Self.wireID)
        pendingSync = Task { _ = await sync.moveTodos(wire, to: stage) }
    }

    private func sendDelete(_ ids: [UUID]) {
        guard let sync, !ids.isEmpty else { return }
        let wire = ids.map(Self.wireID)
        pendingSync = Task { _ = await sync.deleteTodos(wire) }
    }
```
Add next to the existing `asReadOnly()`:

```swift
    /// Like `asReadOnly()`, but keeps the saved flag and position.
    func asReadOnlyKeepingSync() -> OverviewTodoItem {
        var copy = asReadOnly()
        copy.isSaved = isSaved
        copy.position = position
        return copy
    }
```
Make `orchestrateChecked` use `asReadOnlyKeepingSync()` instead of `asReadOnly()` so moved lines keep their saved flag.

Hook them into the existing methods:
- `setText`: after updating, `editing.insert(itemID)`.
- `commitLine`: after trimming and before appending the blank, call `save(index)` when the trimmed text isn't empty.
- `setProjectID`: after updating, `if items[index].isSaved { save(index) }`.
- `remove`: before removing, `if items.first(where: { $0.id == itemID })?.isSaved == true { sendDelete([itemID]) }`.
- `removeChecked`: collect saved checked ids before removing, then call `sendDelete(ids)`.
- `orchestrateChecked`: collect `moving.filter(\.isSaved).map(\.id)` and call `sendMove(ids, to: .inProgress)`. An unsaved ticked line can't exist, because the checkbox is disabled on blank lines; if one is ever moved unsaved, call `save` first.
- `completeInProgress`: after moving, `if item.isSaved { sendMove([itemID], to: .done) }`.

When a save fails, the next snapshot (sent after `router.refresh()`) shows the truth, and `FrameModel.perform` already surfaces `errorMessage` in the existing alert.

- [ ] **Step 7: Connect the page view**

In `OverviewPage.swift`, extend the existing `.onAppear` (keep its focus behaviour) and add `.onChange`:

```swift
        .onAppear {
            todos.sync = frame
            todos.apply(frame.snapshot?.todos ?? [])
            focusedItemID = todos.items.last?.id
        }
        .onChange(of: frame.snapshot?.todos ?? []) { _, saved in
            todos.apply(saved)
        }
```
Change the Orchestrate help text from "isn't connected yet — checked items move into In progress locally" to `String(localized: "Move the ticked to-dos to In progress")`.

- [ ] **Step 8: Run the tests and build**

Run: `cd apps/mac && swift test && swift build`
Expected: all tests PASS, including the existing `OverviewTodoStoreTests`.

- [ ] **Step 9: Commit**

The Mac Overview files were uncommitted before this plan. Ask the owner (or the controller) whether to commit them now as part of this task. If yes:

```bash
git add apps/mac/Sources/OrionAppCore/Frame/FrameSnapshot.swift apps/mac/Tests/OrionAppCoreTests/FrameTests.swift apps/mac/Sources/Orion/Frame/FrameModel.swift apps/mac/Sources/Orion/Frame/OverviewTodoStore.swift apps/mac/Sources/Orion/Frame/OverviewPage.swift apps/mac/Tests/OrionTests/OverviewTodoStoreTests.swift
git commit -m "feat(mac): save Todo, In progress and Completed through the page and report the time zone

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Acceptance and go-live

**Files:** none (operations). Record results in `.context/morning-todos-acceptance.md`.

- [ ] **Step 1: Full test sweep**

```bash
pnpm test
pnpm --filter @meld/gateway test
pnpm --filter @meld/gateway-worker test
pnpm --filter web test
cd apps/mac && swift test
```
Expected: all PASS. Re-run the pgTAP file from Task 1 Step 4 too.

- [ ] **Step 2: Confirm limits and prices against current docs**

- Cloudflare Workers free plan: subrequests per invocation (need ≥ 25) and cron triggers per account (the hourly cron replaces the daily one, so the count doesn't change). Use the Cloudflare docs MCP or the web.
- DeepSeek: current price per million input/output tokens for the model in `DEEPSEEK_TEXT_MODEL`. Estimate a busy day (10 projects × ~8k input + ~600 output tokens) and write the number into the acceptance file.

- [ ] **Step 3: Local run against local data**

With the local stack up (memory "Meld local setup"), add a few messages to a local project through the web app, then:

```bash
GATEWAY_SUPABASE_URL=http://127.0.0.1:54321 \
GATEWAY_SUPABASE_SERVICE_ROLE_KEY=<local service role key from `supabase status`> \
DEEPSEEK_API_KEY=<from apps/web/.env.local> \
pnpm --filter @meld/gateway exec tsx scripts/run-morning-todos.ts --force
```
Expected: a report with `status: "done"`, and the new lines visible on the local Overview (web) with their project picked.

- [ ] **Step 4: Owner eyeball check**

Show the owner a screenshot of the Overview with the generated lines (save under `.context/`). Ask: do the to-dos read like ones they'd write? Adjust `TODO_SYSTEM_PROMPT` if they don't (TDD the prompt-content assertions, if any, in Task 4's test), then re-run Step 3 after deleting that day's `morning_runs` row.

- [ ] **Step 5: Go live (needs the owner's go-ahead)**

The owner (or the agent, with explicit permission) does the following:
1. Merge the branch to `main`. Deploy runs the migration and `wrangler deploy` (`.github/workflows/deploy.yml`). Confirm the migration step exists in that workflow; if migrations are applied manually for Orion Online, apply `20261109000002_morning_todos.sql` to project `edpqfigqmtbqzaauhquc` the same way previous migrations were.
2. Add the Worker secret (the project has `wrangler.jsonc`, so use wrangler):
   ```bash
   cd apps/gateway-worker && pnpm exec wrangler secret put DEEPSEEK_API_KEY
   ```
3. The next morning after 6:00 local, check `select * from public.morning_runs order by started_at desc limit 3;` and look at the Overview.
