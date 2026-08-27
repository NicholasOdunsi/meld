# Chained Screen Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn one long generation that loses everything at the 12-minute ceiling into a chain of short runs that each save their screens, so screens appear a few at a time and a failure costs only the last step.

**Architecture:** Chain state lives on `design_screen_generations`. When `materialize_design_screen_generate` finishes writing a batch, it queues the next run itself through a trigger-safe task-creating function — the existing RPC cannot be used because it reads `auth.uid()`, which is null inside a trigger. The transcript folds every run sharing a `chain_id` into one reply.

**Tech Stack:** PostgreSQL (Supabase, pgTAP), TypeScript, React 19, Next.js 16, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-25-chained-screen-generation-design.md`

**A note on two kinds of step.** Where a step gives complete code, use it verbatim. Where it gives a precise contract plus the full test instead — the two SQL functions re-created from a `pg_dump` in Tasks 2 and 3, and the JSX in Task 5 — that is deliberate: reproducing a 300-line function body or guessing at surrounding JSX in a plan produces code that gets pasted in and quietly reshaped until it compiles. Dump the real thing, make the named edit, and let the tests be the contract.

## Global Constraints

- **The ceiling is three follow-ups — four runs at most.** Run 1 is `chain_step` 0; follow-ups are 1, 2, 3; a task at step 3 queues nothing further.
- **The frozen list never grows.** Run 1 decides the flow's extent. Later runs may only shrink it.
- **A follow-up inherits `provider`, `model` and `device_id` from its parent task** — never re-derived from user preferences. A chain started on Opus finishes on Opus.
- **The follow-up's instruction is exactly:** `build these screens for the flow: <comma-separated keys>`
- **The transcript's denominator is fixed for the chain's life** — screens run 1 built plus the frozen list it named. It must never move, or the count appears to go backwards.
- **A failed, cancelled or timed-out run queues nothing.** Only a `completed` task chains.
- Node must be v22.23.2: `export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"`.
- Run web tests from `apps/web`. Run pgTAP against a **scratch database**, never `supabase db reset` — that wipes local dev data. Recipe in Task 1.
- The connector is a LaunchAgent running an installed bundle. Database work needs no rebuild; nothing in this plan touches the connector.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `supabase/migrations/<ts>_design_screen_chain_state.sql` | Four chain columns + the trigger-safe creator | 1 |
| `supabase/tests/design_screen_chain.test.sql` | pgTAP for the whole chain | 1, 2 |
| `supabase/migrations/<ts>_design_screen_chain_queue.sql` | Materializer queues the follow-up | 2 |
| `supabase/migrations/<ts>_design_agent_turn_chain_id.sql` | `list_design_agent_turns` returns `chainId` + `chainTotal` | 3 |
| `apps/web/src/features/design/design-agent-transcript.ts` | `chainId` + `chainTotal` on the turn type | 3 |
| `apps/web/src/features/design/group-design-turns.ts` | Group by `chainId` | 4 |
| `apps/web/src/features/design/components/agents-transcript.tsx` | Progress copy | 5 |

---

### Task 1: Chain state and a trigger-safe task creator

**Files:**
- Create: `supabase/migrations/202608250001_design_screen_chain_state.sql`
- Create: `supabase/tests/design_screen_chain.test.sql`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `design_screen_generations.chain_id uuid`, `chain_remaining text[] not null default '{}'`, `chain_step integer not null default 0`, `chain_total integer not null default 0`
  - `public.queue_design_screen_chain_step(parent_task_id uuid, screen_keys text[]) returns uuid` — creates a placeholder screen, a task and a generation row for the next link, returning the new task id. Returns `null` when it declines (see rules below).

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/design_screen_chain.test.sql`. Model the fixtures on `supabase/tests/design_screen_batch_materialize.test.sql`, which already builds a workspace, project, room, membership, execution device, provider connection and AI preferences — copy that setup block and change the UUID prefix to `c1` so it cannot collide.

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- [paste the fixture block from design_screen_batch_materialize.test.sql,
--  with every 'aa'/'ab'/'ac'/'ad'/'ae'/'af' UUID prefix changed to 'c1'..'c6']

select has_column('public'::name, 'design_screen_generations'::name, 'chain_id'::name,
  'design_screen_generations.chain_id exists');
select has_column('public'::name, 'design_screen_generations'::name, 'chain_remaining'::name,
  'design_screen_generations.chain_remaining exists');
select has_column('public'::name, 'design_screen_generations'::name, 'chain_step'::name,
  'design_screen_generations.chain_step exists');

-- A parent task to chain from.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000002', true);
select public.create_design_screen_generate_task('c5000000-0000-4000-8000-000000000001');
reset role;

create temporary table parent as
select task_id from public.design_screen_generations
where screen_id = 'c5000000-0000-4000-8000-000000000001';

-- The queue function creates the next link.
create temporary table child as
select public.queue_design_screen_chain_step(
  (select task_id from parent), array['verify_docs','activate']
) as task_id;

select isnt((select task_id from child), null,
  'queue_design_screen_chain_step returns a new task id');

select is(
  (select instruction from public.ai_tasks where id = (select task_id from child)),
  'build these screens for the flow: verify_docs, activate',
  'the follow-up names the keys and nothing else'
);

-- Inheritance, not re-derivation: a chain started on one model stays on it.
select is(
  (select array[provider::text, coalesce(model,'-'), device_id::text]
     from public.ai_tasks where id = (select task_id from child)),
  (select array[provider::text, coalesce(model,'-'), device_id::text]
     from public.ai_tasks where id = (select task_id from parent)),
  'the follow-up inherits provider, model and device from its parent'
);

select is(
  (select chain_step from public.design_screen_generations
    where task_id = (select task_id from child)),
  1,
  'the follow-up is one step further along'
);

select is(
  (select chain_remaining from public.design_screen_generations
    where task_id = (select task_id from child)),
  array['verify_docs','activate'],
  'the follow-up carries the remaining keys'
);

-- The ceiling.
update public.design_screen_generations
set chain_step = 3 where task_id = (select task_id from parent);
select is(
  public.queue_design_screen_chain_step((select task_id from parent), array['x']),
  null,
  'a parent at step 3 queues nothing -- three follow-ups, four runs in total'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to verify it fails**

Clone the schema into a scratch database rather than resetting the dev one (which wipes local data):

```bash
docker exec supabase_db_meld psql -U supabase_admin -d postgres -c "drop database if exists meld_scratch;"
docker exec supabase_db_meld sh -c "pg_dump -U supabase_admin -d postgres --schema-only > /tmp/schema.sql"
docker exec supabase_db_meld psql -U supabase_admin -d postgres -c "create database meld_scratch;"
docker exec supabase_db_meld psql -U supabase_admin -d meld_scratch -c "alter database meld_scratch set search_path to public, extensions;"
docker exec supabase_db_meld sh -c "psql -U supabase_admin -d meld_scratch -f /tmp/schema.sql" >/dev/null 2>&1
docker exec -i supabase_db_meld psql -U supabase_admin -d meld_scratch < supabase/tests/design_screen_chain.test.sql 2>&1 | grep -E "not ok|Looks like|ERROR" | head
```

Expected: FAIL — `chain_id` does not exist, and `queue_design_screen_chain_step` is undefined.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/202608250001_design_screen_chain_state.sql`:

```sql
-- A generation writes nothing until the model finishes the whole batch, and the
-- provider cuts a run off at 12 minutes. "Design the full flow" therefore
-- attempted nine-plus screens, ran past the ceiling and was discarded whole --
-- 722 seconds, not one screen saved, three times.
--
-- A request becomes a chain of short runs instead. These columns carry the
-- chain across the runs that make it up.

alter table public.design_screen_generations
  add column if not exists chain_id uuid,
  add column if not exists chain_remaining text[] not null default '{}',
  add column if not exists chain_step integer not null default 0,
  -- The flow's size as the first run saw it: what it built plus what it named.
  -- Stored rather than derived, because `chain_remaining` shrinks as the chain
  -- advances -- recomputing the total from it would make the progress count
  -- appear to go backwards, which reads as a bug even when nothing is wrong.
  add column if not exists chain_total integer not null default 0;

-- Finding a chain's other runs is the transcript's hot path.
create index if not exists design_screen_generations_chain
  on public.design_screen_generations (chain_id)
  where chain_id is not null;

-- The trigger-safe twin of create_design_screen_generate_task.
--
-- The chain is queued from inside materialize_design_screen_generate, where
-- there is no JWT -- so `auth.uid()` is null and the existing RPC refuses. This
-- takes the initiating user from the parent task instead, and inherits the
-- parent's device, provider and model rather than re-reading preferences: a
-- chain started on Opus must finish on Opus, not switch to a default halfway
-- through a flow.
create or replace function public.queue_design_screen_chain_step(
  parent_task_id uuid,
  screen_keys text[]
) returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  parent_task public.ai_tasks;
  parent_generation public.design_screen_generations;
  placeholder public.design_screens;
  next_task public.ai_tasks;
  next_x double precision;
begin
  if screen_keys is null or array_length(screen_keys, 1) is null then
    return null;
  end if;

  select * into parent_task from public.ai_tasks where id = parent_task_id;
  if not found then
    return null;
  end if;

  select * into parent_generation
  from public.design_screen_generations where task_id = parent_task_id;
  if not found then
    return null;
  end if;

  -- Three follow-ups, four runs. Step 3 is the last link.
  if parent_generation.chain_step >= 3 then
    return null;
  end if;

  -- A device that has since been revoked ends the chain quietly rather than
  -- queueing work nothing can claim.
  if not exists (
    select 1 from public.execution_devices
    where id = parent_task.device_id
      and status = 'active'
      and revoked_at is null
  ) then
    return null;
  end if;

  select coalesce(max(canvas_x), 0) + 460 into next_x
  from public.design_screens
  where room_id = parent_task.room_id and deleted_at is null;

  -- The placeholder resolves to whichever key the model declares, through the
  -- idx-0-resolves-by-key rule in 202608230007.
  insert into public.design_screens (
    room_id, workspace_id, name, canvas_x, canvas_y, created_by
  ) values (
    parent_task.room_id,
    parent_task.workspace_id,
    'Screen',
    coalesce(next_x, 0),
    0,
    parent_task.initiating_user_id
  )
  returning * into placeholder;

  insert into public.ai_tasks (
    initiating_user_id, workspace_id, room_id, device_id, provider, model,
    kind, status, instruction, context_manifest_json, context_revision
  ) values (
    parent_task.initiating_user_id,
    parent_task.workspace_id,
    parent_task.room_id,
    parent_task.device_id,
    parent_task.provider,
    parent_task.model,
    'design_screen_generate',
    'queued',
    'build these screens for the flow: ' || array_to_string(screen_keys, ', '),
    parent_task.context_manifest_json,
    parent_task.context_revision
  )
  returning * into next_task;

  insert into public.design_screen_generations (
    task_id, screen_id, room_id, base_version_id, profile_version_id,
    chain_id, chain_remaining, chain_step, chain_total
  ) values (
    next_task.id,
    placeholder.id,
    parent_task.room_id,
    null,
    parent_generation.profile_version_id,
    coalesce(parent_generation.chain_id, parent_task_id),
    screen_keys,
    parent_generation.chain_step + 1,
    parent_generation.chain_total
  );

  update public.design_screens
  set updating = true, updated_at = now()
  where id = placeholder.id;

  return next_task.id;
end;
$$;

revoke all on function public.queue_design_screen_chain_step(uuid, text[]) from public;
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
docker exec -i supabase_db_meld psql -U supabase_admin -d meld_scratch < supabase/migrations/202608250001_design_screen_chain_state.sql
docker exec -i supabase_db_meld psql -U supabase_admin -d meld_scratch < supabase/tests/design_screen_chain.test.sql 2>&1 | grep -cE "^ ok [0-9]+"
```
Expected: `9`, with no `not ok` lines.

- [ ] **Step 5: Apply to the dev database and commit**

```bash
export PATH="$HOME/.local/share/supabase:$PATH"   # 2.109.1 -- brew's 2.111 WIPES the DB
supabase migration up --local
git add supabase/migrations/202608250001_design_screen_chain_state.sql supabase/tests/design_screen_chain.test.sql
git commit -m "feat(design): carry chain state on a generation"
```

---

### Task 2: The materializer queues the next link

**Files:**
- Create: `supabase/migrations/202608250002_design_screen_chain_queue.sql`
- Modify: `supabase/tests/design_screen_chain.test.sql`

**Interfaces:**
- Consumes: `queue_design_screen_chain_step(uuid, text[])` from Task 1.
- Produces: a completed `design_screen_generate` task with unbuilt keys queues exactly one follow-up, and the first run's row carries `chain_id` and a frozen `chain_total`.

**Cancelling needs no separate handling.** Only a `completed` task queues a follow-up, so a cancelled run stops the chain by the same rule a failed one does — and the screens earlier links wrote stay put.

**How the frozen list is computed.** On the **first** run of a chain (`chain_step = 0` and `chain_id is null`), the list is every `targetScreenKey` named in the batch's actions that no live screen in the room owns. On a **follow-up**, the list is the parent's `chain_remaining` minus whatever this run built — it may only shrink.

- [ ] **Step 1: Write the failing tests**

Append to `supabase/tests/design_screen_chain.test.sql`, and raise `plan(9)` to `plan(13)`:

```sql
-- A completed first run with unbuilt targets queues exactly one follow-up.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000002', true);
select public.create_design_screen_generate_task('c5000000-0000-4000-8000-000000000002');
reset role;

create temporary table run1 as
select task_id from public.design_screen_generations
where screen_id = 'c5000000-0000-4000-8000-000000000002';

update public.ai_tasks
set status = 'completed',
    result_json = '{
      "partial": false,
      "payload": {"screens": [{
        "screenKey": "home",
        "markup": "<main>Home</main>",
        "styles": "main{display:block}",
        "script": null,
        "actions": [
          {"id": "a", "label": "Verify", "targetScreenKey": "verify_docs"},
          {"id": "b", "label": "Done", "targetScreenKey": "activate"}
        ]
      }]}
    }'
where id = (select task_id from run1);

select is(
  (select count(*)::integer from public.ai_tasks
    where kind = 'design_screen_generate'
      and instruction like 'build these screens for the flow:%'),
  1,
  'a completed run with unbuilt targets queues exactly one follow-up'
);

select is(
  (select chain_remaining from public.design_screen_generations
    where chain_step = 1),
  array['activate','verify_docs'],
  'the follow-up carries the keys the run linked to but did not build'
);

-- A run that builds everything it linked to queues nothing.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000002', true);
select public.create_design_screen_generate_task('c5000000-0000-4000-8000-000000000003');
reset role;

update public.ai_tasks
set status = 'completed',
    result_json = '{
      "partial": false,
      "payload": {"screens": [{
        "screenKey": "solo",
        "markup": "<main>Solo</main>",
        "styles": "main{display:block}",
        "script": null,
        "actions": []
      }]}
    }'
where id = (select task_id from public.design_screen_generations
            where screen_id = 'c5000000-0000-4000-8000-000000000003');

select is(
  (select count(*)::integer from public.ai_tasks
    where kind = 'design_screen_generate'
      and instruction like 'build these screens for the flow:%'),
  1,
  'a run with nothing left over queues nothing'
);

-- A failed run queues nothing. Only `completed` chains.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000002', true);
select public.create_design_screen_generate_task('c5000000-0000-4000-8000-000000000004');
reset role;

update public.ai_tasks
set status = 'failed'
where id = (select task_id from public.design_screen_generations
            where screen_id = 'c5000000-0000-4000-8000-000000000004');

select is(
  (select count(*)::integer from public.ai_tasks
    where kind = 'design_screen_generate'
      and instruction like 'build these screens for the flow:%'),
  1,
  'a failed run queues nothing -- the chain stops, earlier screens stay'
);
```

Add these fixture screens beside the existing ones in the setup block:

```sql
insert into public.design_screens (id, room_id, workspace_id, name, created_by)
values
  ('c5000000-0000-4000-8000-000000000002','c4000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','Screen Two','c1000000-0000-4000-8000-000000000002'),
  ('c5000000-0000-4000-8000-000000000003','c4000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','Screen Three','c1000000-0000-4000-8000-000000000002'),
  ('c5000000-0000-4000-8000-000000000004','c4000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','Screen Four','c1000000-0000-4000-8000-000000000002');
```

- [ ] **Step 2: Run to verify it fails**

```bash
docker exec -i supabase_db_meld psql -U supabase_admin -d meld_scratch < supabase/tests/design_screen_chain.test.sql 2>&1 | grep -E "not ok|Looks like" | head
```
Expected: FAIL — nothing queues a follow-up yet.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/202608250002_design_screen_chain_queue.sql`. Dump the current function body first so nothing else is lost:

```bash
docker exec supabase_db_meld psql -U postgres -d postgres -tAc \
  "select pg_get_functiondef(oid) from pg_proc where proname='materialize_design_screen_generate';" > /tmp/materialize.sql
```

Take the `CREATE OR REPLACE FUNCTION` statement from that file verbatim, and immediately before its final `return new;` add:

```sql
  -- Queue the next link.
  --
  -- Nothing is written until a run finishes, and the provider cuts one off at
  -- 12 minutes, so one long run that tried to build a whole flow lost every
  -- screen it had already written. A chain of short runs each saves its own.
  --
  -- Only a completed run chains: a failure or a cancellation stops here, and
  -- the screens earlier links wrote stay exactly where they are.
  declare
    chain_keys text[];
  begin
    if new.status = 'completed' then
      if generation.chain_id is null then
        -- First run: the flow's extent is decided here and frozen. Every key
        -- this batch linked to that no live screen owns.
        select coalesce(array_agg(distinct key order by key), '{}')
        into chain_keys
        from (
          select jsonb_array_elements(version.actions_json) ->> 'targetScreenKey' as key
          from public.design_screen_versions as version
          where version.originating_task_id = new.id
        ) as targets
        where key is not null
          and not exists (
            select 1 from public.design_screens as owner
            where owner.room_id = generation.room_id
              and owner.screen_key = key
              and owner.deleted_at is null
          );
      else
        -- A follow-up may only shrink the list, never grow it.
        select coalesce(array_agg(key order by key), '{}')
        into chain_keys
        from unnest(generation.chain_remaining) as key
        where not exists (
          select 1 from public.design_screens as owner
          where owner.room_id = generation.room_id
            and owner.screen_key = key
            and owner.deleted_at is null
        );
      end if;

      if array_length(chain_keys, 1) is not null then
        -- Stamp the first run so its own chain is findable before the next
        -- link inherits the id.
        if generation.chain_id is null then
          -- Freeze both the chain's identity and its size in one place: what
          -- this run built, plus what it named and did not.
          update public.design_screen_generations
          set chain_id = new.id,
              chain_total = array_length(chain_keys, 1) + (
                select count(*) from public.design_screen_versions
                where originating_task_id = new.id
              )
          where task_id = new.id;
        end if;
        perform public.queue_design_screen_chain_step(new.id, chain_keys);
      end if;
    end if;
  end;
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
docker exec -i supabase_db_meld psql -U supabase_admin -d meld_scratch < supabase/migrations/202608250002_design_screen_chain_queue.sql
docker exec -i supabase_db_meld psql -U supabase_admin -d meld_scratch < supabase/tests/design_screen_chain.test.sql 2>&1 | grep -cE "^ ok [0-9]+"
```
Expected: `13`, no `not ok`.

Also re-run the existing batch suite, which exercises the same trigger:

```bash
docker exec -i supabase_db_meld psql -U supabase_admin -d meld_scratch < supabase/tests/design_screen_batch_materialize.test.sql 2>&1 | grep -E "not ok|Looks like" | head
```
Expected: no output.

- [ ] **Step 5: Apply and commit**

```bash
export PATH="$HOME/.local/share/supabase:$PATH"
supabase migration up --local
git add supabase/migrations/202608250002_design_screen_chain_queue.sql supabase/tests/design_screen_chain.test.sql
git commit -m "feat(design): queue the next link when a batch lands"
```

---

### Task 3: The transcript learns about chains

**Files:**
- Create: `supabase/migrations/202608250003_design_agent_turn_chain_id.sql`
- Modify: `apps/web/src/features/design/design-agent-transcript.ts`

**Interfaces:**
- Consumes: `design_screen_generations.chain_id` from Task 1.
- Produces: `DesignAgentTurn` gains `chainId: string | null` and `chainTotal: number`, and `list_design_agent_turns` returns both.

- [ ] **Step 1: Write the migration**

Dump the function and re-create it with one added column:

```bash
docker exec supabase_db_meld psql -U postgres -d postgres -tAc \
  "select pg_get_functiondef(oid) from pg_proc where proname='list_design_agent_turns';" > /tmp/turns.sql
```

Create `supabase/migrations/202608250003_design_agent_turn_chain_id.sql` from that definition, adding `generation.chain_id as "chainId", generation.chain_total as "chainTotal",` to the select list and `"chainId" uuid, "chainTotal" integer` to the `returns table (...)` signature, in matching positions. Precede it with:

```sql
-- A chained request is several tasks minutes apart with different
-- instructions, so the transcript's "same prompt within 60 seconds" rule
-- cannot see that they are one piece of work -- it would show four Design
-- Agent replies for one ask. The chain id is what lets it show one.
drop function if exists public.list_design_agent_turns(uuid);
```

Keep every existing grant on the function; a `drop`/`create` loses them.

- [ ] **Step 2: Apply it and confirm the column comes back**

```bash
export PATH="$HOME/.local/share/supabase:$PATH"
supabase migration up --local
docker exec supabase_db_meld psql -U postgres -d postgres -tAc \
  "select pg_get_function_result(oid) from pg_proc where proname='list_design_agent_turns';" | grep -c chainId
```
Expected: `1`.

- [ ] **Step 3: Add the field to the turn type**

In `apps/web/src/features/design/design-agent-transcript.ts`, add to `DesignAgentTurn`:

```ts
  /**
   * Groups the runs of one chained request. Null for a single-run turn.
   *
   * A chain is several tasks minutes apart with different instructions, so the
   * "same prompt within 60 seconds" rule cannot see they belong together.
   */
  chainId: string | null;
  /**
   * The flow's size as the first run saw it. Fixed for the chain's life, so
   * the progress count cannot appear to go backwards.
   */
  chainTotal: number;
```

Map both from the row alongside the existing fields, defaulting to `null` and `0`.

- [ ] **Step 4: Typecheck**

```bash
cd apps/web && npx tsc --noEmit -p tsconfig.json
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/202608250003_design_agent_turn_chain_id.sql apps/web/src/features/design/design-agent-transcript.ts
git commit -m "feat(design): expose a turn's chain to the transcript"
```

---

### Task 4: One reply per chain

**Files:**
- Modify: `apps/web/src/features/design/group-design-turns.ts`
- Test: `apps/web/src/features/design/group-design-turns.test.ts`

**Interfaces:**
- Consumes: `DesignAgentTurn.chainId` from Task 3.
- Produces: `GroupedDesignTurn` gains `chainId: string | null` and `chainTotal: number`. Turns sharing a non-null `chainId` fold into one group regardless of time gap or wording.

- [ ] **Step 1: Write the failing tests**

```ts
it("folds every run of one chain into a single reply", () => {
  // A chain is one ask. Four bubbles for one request is the spam the batch
  // grouping already exists to prevent -- these runs are minutes apart with
  // different instructions, so only the chain id can tell they belong together.
  const grouped = groupDesignTurnsBySend([
    turn({ taskId: "t1", chainId: "c1", userPrompt: "design the full flow", createdAt: "2026-08-25T10:00:00Z" }),
    turn({ taskId: "t2", chainId: "c1", userPrompt: "build these screens for the flow: a, b", createdAt: "2026-08-25T10:06:00Z" }),
    turn({ taskId: "t3", chainId: "c1", userPrompt: "build these screens for the flow: c", createdAt: "2026-08-25T10:12:00Z" }),
  ]);
  expect(grouped).toHaveLength(1);
  expect(grouped[0]?.taskIds).toEqual(["t1", "t2", "t3"]);
});

it("keeps separate chains apart", () => {
  const grouped = groupDesignTurnsBySend([
    turn({ taskId: "t1", chainId: "c1", createdAt: "2026-08-25T10:00:00Z" }),
    turn({ taskId: "t2", chainId: "c2", createdAt: "2026-08-25T10:00:30Z" }),
  ]);
  expect(grouped).toHaveLength(2);
});

it("still folds a parallel fan-out that has no chain", () => {
  // The existing rule has to keep working: editing three selected screens
  // queues three tasks with the same prompt, seconds apart, and no chain id.
  const grouped = groupDesignTurnsBySend([
    turn({ taskId: "t1", chainId: null, userPrompt: "make it blue", createdAt: "2026-08-25T10:00:00Z" }),
    turn({ taskId: "t2", chainId: null, userPrompt: "make it blue", createdAt: "2026-08-25T10:00:01Z" }),
  ]);
  expect(grouped).toHaveLength(1);
});

it("never folds two turns that merely both lack a chain and differ", () => {
  const grouped = groupDesignTurnsBySend([
    turn({ taskId: "t1", chainId: null, userPrompt: "one", createdAt: "2026-08-25T10:00:00Z" }),
    turn({ taskId: "t2", chainId: null, userPrompt: "two", createdAt: "2026-08-25T10:00:01Z" }),
  ]);
  expect(grouped).toHaveLength(2);
});
```

Add a `turn()` helper if the file has none, building a `DesignAgentTurn` with sensible defaults and spreading the overrides.

- [ ] **Step 2: Run to verify it fails**

```bash
cd apps/web && pnpm vitest run src/features/design/group-design-turns.test.ts
```
Expected: FAIL — chained turns come back as three groups.

- [ ] **Step 3: Implement**

In `isSameSend`, add before the existing prompt and window checks:

```ts
  // A chain is one ask spread over several runs: minutes apart, each with a
  // different instruction. Neither the prompt check nor the time window below
  // can see that, so the chain id decides on its own when there is one.
  if (a.chainId && b.chainId) return a.chainId === b.chainId;
  if (a.chainId || b.chainId) return false;
```

Carry `chainId` and `chainTotal` onto the group in the `grouped.push({...})` branch. When folding a later run into an existing group, **keep the group's existing `chainTotal`** — every run of a chain carries the same frozen value, so it must never be overwritten by a recomputed one.

- [ ] **Step 4: Run tests**

```bash
cd apps/web && pnpm vitest run src/features/design/group-design-turns.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/design/group-design-turns.ts apps/web/src/features/design/group-design-turns.test.ts
git commit -m "feat(design): show one reply for a chained request"
```

---

### Task 5: Say how far along it is

**Files:**
- Modify: `apps/web/src/features/design/components/agents-transcript.tsx`
- Test: `apps/web/src/features/design/components/agents-transcript.batch.test.tsx`

**Interfaces:**
- Consumes: `GroupedDesignTurn.chainId`, `chainTotal` and `screens` from Task 4.
- Produces: no new exports — copy only.

**The denominator is fixed.** Read it from `group.chainTotal`, which the database froze when the chain began. Never recompute it from the current screen count or the remaining list — both move as the chain advances, and the count would appear to go backwards.

- [ ] **Step 1: Write the failing tests**

```tsx
it("says how far through a chain it is while it is still going", () => {
  // Screens appearing a few at a time IS the progress indicator -- it is real
  // output, not an animation. The count is the honest version of a spinner.
  renderTurns([
    chainTurn({ built: 4, total: 9, taskStatus: "running" }),
  ]);
  expect(screen.getByText(/Built 4 of 9/)).toBeInTheDocument();
  expect(screen.getByText(/building the next/i)).toBeInTheDocument();
});

it("drops the counter once the chain has finished", () => {
  renderTurns([chainTurn({ built: 9, total: 9, taskStatus: "completed" })]);
  expect(screen.getByText(/Built 9 screens/)).toBeInTheDocument();
  expect(screen.queryByText(/building the next/i)).not.toBeInTheDocument();
});

it("says plainly when the ceiling stopped it early", () => {
  // Never silently truncate: eight screens when eleven were named has to read
  // as a stopping point with a way forward, not as success.
  renderTurns([chainTurn({ built: 8, total: 11, taskStatus: "completed" })]);
  expect(screen.getByText(/Built 8 of 11/)).toBeInTheDocument();
  expect(screen.getByText(/Ask again to continue/)).toBeInTheDocument();
});
```

Write `chainTurn()` next to the file's existing turn builders, producing a grouped turn with `chainId: "c1"`, `chainTotal: total`, and `built` screens.

- [ ] **Step 2: Run to verify it fails**

```bash
cd apps/web && pnpm vitest run src/features/design/components/agents-transcript.batch.test.tsx
```
Expected: FAIL — no such copy is rendered.

- [ ] **Step 3: Implement**

In `DesignTurnBubbles`, where the summary line is built, branch on the group having a `chainId`:

- still running → `Built ${built} of ${total} · building the next…`
- finished and `built >= total` → the existing `Built ${built} screens` wording
- finished and `built < total` → `Built ${built} of ${total}. Ask again to continue.`

Leave the non-chain path exactly as it is.

- [ ] **Step 4: Run the tests and the wider suite**

```bash
cd apps/web && pnpm vitest run src/features/design
```
Expected: the new tests pass and nothing else regresses.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/design/components/agents-transcript.tsx apps/web/src/features/design/components/agents-transcript.batch.test.tsx
git commit -m "feat(design): show a chain's progress as screens land"
```

---

## Manual verification (no test covers this)

The chain's mechanics are covered by pgTAP; whether a chained run produces a **coherent flow** is not testable and has to be looked at.

1. In a room with one built screen, ask for a full flow (`@Design Agent design the full flow after the homepage`).
2. Watch the transcript: one reply, count climbing, screens appearing in the carousel a few at a time.
3. Confirm the follow-up runs are visibly shorter than the first — that is the whole point.
4. **Look at the screens together.** Do runs 2 and 3 match run 1's brand name, shell and proportions? This is the risk: four separate generations, and screen-to-screen drift is a problem this codebase has fought at length.
5. Cancel mid-chain and confirm no further run is queued.

Watch `ai_tasks` while it runs:

```sql
select left(id::text,8), status, instruction, created_at
from ai_tasks where kind='design_screen_generate'
order by created_at desc limit 5;
```

## Out of scope

- Streaming within a single run — structured output arrives as one block
- Changing the 4-screen prompt cap or the 12-minute provider ceiling
- Retrying a failed run automatically
- Letting a chain add screens the first run did not name
