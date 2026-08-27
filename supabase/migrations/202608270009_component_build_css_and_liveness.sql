-- Final-review fixes to the component build pass. Four separate faults, all
-- in the same two functions, so they land as one migration.
--
-- 1. A batch that settles anywhere other than `completed` wedged the pass for
--    ever. `queue_design_component_build_batch`'s liveness guard treated
--    everything except completed/cancelled/failed as "a batch is still in
--    flight", so a batch parked in `needs_review` (what `settle_ai_task` maps
--    `malformed_output` to) or `usage_limit_reached` blocked every later
--    batch -- including the one a person asks for by pressing the button
--    again. The pass never closed, and the partial unique index
--    `design_component_build_passes_one_open` held the workspace's single
--    pass slot for ever.
--
-- 2. `component_css` was stale the instant a batch merged. Every version the
--    merge inserted copied the column forward unchanged from the version it
--    was copied from, so the moment a component gained markup in
--    `profile_json` the compiled stylesheet described a design system that no
--    longer existed. Every reader of the column -- room prototypes
--    (prototype-reader.ts), the room's design profile
--    (design-profile-reader.ts) -- got the pre-pass stylesheet. Only the
--    Design System page repaired it, from TypeScript, opportunistically, if
--    somebody happened to visit it.
--
-- 3. `materialize_design_component_build` had no `exception when others`
--    despite its own header stating it must never raise, and despite its
--    sibling `materialize_design_profile_distill` (202608270008) carrying
--    exactly that guard. Its nested INSERT into `ai_tasks` is a real raise
--    surface (`ai_tasks_instruction_length`), and a raise inside an AFTER
--    trigger on `ai_tasks` aborts the whole of `settle_ai_task`: the
--    connector cannot settle the task at all and the run wedges
--    non-terminally.
--
-- 4. `set_design_component_css` (202608270004) refused any css containing
--    `</`, while the build prompt MANDATES that images be `data:` URIs --
--    `url("data:image/svg+xml,<svg ... </svg>")` trips it. That migration's
--    own round-2 comment claimed the `%<%` -> `%</%` narrowing had unblocked
--    inline SVG data-URIs. It had not. Rather than narrow the guard a third
--    time, the whole repair path goes away (see below).

-- ---------------------------------------------------------------------------
-- component_css, produced where the profile changes
-- ---------------------------------------------------------------------------
-- The one place `component_css` is now produced for a version the DATABASE
-- creates. This is `compileComponentCss` (packages/prototype/src/component-css.ts)
-- transliterated: one `/* ds:<name> */` header per component that has css,
-- blocks joined with a newline, and a running total that STOPS at the first
-- block which would carry the stylesheet past MAX_COMPONENT_CSS_TOTAL_BYTES
-- (49152) -- `break`, not `continue`, so a small component after a huge one
-- is dropped too and the output is a prefix rather than a selection.
--
-- Why here rather than in TypeScript. The alternative -- letting whoever
-- happens to load a page recompile the column and write it back -- is what
-- was there before, and it has two faults that no amount of care fixes: the
-- value is wrong for every reader who arrives before that page load, and two
-- implementations of the same rule are then both authoritative and free to
-- disagree. Producing it in the same statement that writes `profile_json`
-- makes the column correct at every read by construction, and leaves exactly
-- one writer.
--
-- The connector still computes a `componentCss` for a distillation's payload,
-- and `materialize_design_profile_distill` still stores it: that value is
-- compiled from the very profile being stored, in the same breath, so it
-- cannot describe a different design system. It is an initial write, not a
-- repair. What is gone is the repair.
create function public.compile_design_component_css(profile jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  entry jsonb;
  component_name text;
  component_css text;
  block text;
  block_size integer;
  used integer := 0;
  blocks text[] := array[]::text[];
begin
  if profile is null
    or pg_catalog.jsonb_typeof(profile -> 'components') <> 'array'
  then
    return '';
  end if;

  for entry in
    select value from pg_catalog.jsonb_array_elements(profile -> 'components')
  loop
    if pg_catalog.jsonb_typeof(entry) <> 'object'
      or pg_catalog.jsonb_typeof(entry -> 'name') <> 'string'
    then
      continue;
    end if;
    component_name := entry ->> 'name';
    component_css := entry ->> 'css';
    if component_css is null or component_css = '' then
      continue;
    end if;

    block := '/* ds:' || component_name || ' */' || chr(10) || component_css;
    -- +1 for the newline this block will be joined with, matching how the
    -- TypeScript compiler accounts for the separator.
    block_size := pg_catalog.octet_length(block) + 1;
    if used + block_size > 49152 then
      exit;
    end if;
    blocks := blocks || block;
    used := used + block_size;
  end loop;

  return pg_catalog.array_to_string(blocks, chr(10));
end;
$$;

revoke all on function public.compile_design_component_css(jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The liveness guard
-- ---------------------------------------------------------------------------
-- Unchanged from 202608270002 except for the `exists` below.
create or replace function public.queue_design_component_build_batch(
  target_pass_id uuid,
  target_attempt integer default 1
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  pass public.design_component_build_passes;
  pending text[];
  batch text[];
  new_task_id uuid;
begin
  -- Locked for the rest of this function so that two callers -- a person
  -- pressing the button while the materializer is advancing the pass -- cannot
  -- both decide the pass needs another batch.
  select * into pass
  from public.design_component_build_passes
  where id = target_pass_id
  for update;

  if not found or pass.completed_at is not null then
    return null;
  end if;

  -- Never a second batch while one is still live. Without this, pressing the
  -- button again mid-run queued a duplicate batch over the same components,
  -- burning the retry budget below on work already under way.
  --
  -- "Live" is now the four statuses a task can still reach `completed` from
  -- ON ITS OWN: queued, waiting_for_device, ready_to_run, running.
  --
  -- It used to be "everything except completed/cancelled/failed", which
  -- looked equivalent and was not. `needs_review`, `needs_reauthentication`
  -- and `usage_limit_reached` are all terminal until a PERSON acts, and for a
  -- component build no person ever does -- there is no review surface for a
  -- batch of components, and `settle_ai_task` sends every `malformed_output`
  -- there. So one such batch counted as "in flight" for ever: the pass never
  -- queued another batch, never closed, and held this workspace's only pass
  -- slot indefinitely while the button kept answering "Building the rest of
  -- your components."
  --
  -- The cost of the narrower rule is that a parked batch someone later
  -- resumes could run alongside a batch queued in the meantime. That is
  -- bounded: `pending` below counts a component's own prior batches and stops
  -- at two, and the merge is by name, so the worst case is one duplicated
  -- provider run over at most four components. A permanent wedge is not
  -- bounded by anything.
  if exists (
    select 1
    from public.design_component_builds as live
    join public.ai_tasks as task on task.id = live.task_id
    where live.pass_id = pass.id
      and task.status in (
        'queued', 'waiting_for_device', 'ready_to_run', 'running'
      )
  ) then
    return null;
  end if;

  -- What is still missing, minus whatever this pass has already sent twice.
  --
  -- "Retried once, then left as prose" has to be enforced here rather than at
  -- the call site. The materializer's retry branch keys off the batch it just
  -- settled (`attempt = 1`), but the next batch is chosen from `pending`, and
  -- a component that never validates stays in `pending` for ever -- so the
  -- pass alternated attempt 1, attempt 2, attempt 1 ... queueing a model run
  -- each time and never closing. Counting a component's own prior batches
  -- bounds it at two runs and lets the pass finish, leaving the component as
  -- the prose it already was.
  pending := array(
    select candidate.name
    from unnest(public.pending_design_components(pass.target_version_id))
      as candidate(name)
    where (
      select pg_catalog.count(*)
      from public.design_component_builds as prior
      where prior.pass_id = pass.id
        and candidate.name = any(prior.component_names)
    ) < 2
  );

  if coalesce(array_length(pending, 1), 0) = 0 then
    -- Nothing left to send -- either everything built, or what did not build
    -- has had its two goes. Adopt the rebuilt version and close the pass.
    --
    -- Adoption is conditional on the pointer still being where the pass found
    -- it. `materialize_design_profile_distill` moves `active_version_id`
    -- unconditionally, so a distillation the person ran mid-pass would
    -- otherwise be silently overwritten by this pass's copy of the profile as
    -- it was BEFORE that distillation -- losing the newer work entirely. When
    -- the pointer has moved, the newer design system wins and this pass's
    -- rebuilt copy is simply left unused. The pass is still closed: it has
    -- nothing more to do, and leaving it open would let the next run resume
    -- from a base nobody is looking at any more.
    update public.design_system_profiles
    set active_version_id = pass.target_version_id,
        updated_at = now()
    where workspace_id = pass.workspace_id
      and active_version_id = pass.source_version_id;

    update public.design_component_build_passes
    set completed_at = now()
    where id = pass.id;

    return null;
  end if;

  batch := pending[1:4];

  -- Inserted directly rather than through `create_ai_task`, which takes a
  -- device and no model. This mirrors how a chained screen queues its next
  -- link (202608250004): the pass carries the device and provider chosen when
  -- it started, and every batch reuses them.
  --
  -- The model is pinned to the provider's fast tier. A component is small and
  -- self-contained; the reasoning tier a whole screen needs buys nothing here
  -- and costs minutes per batch. Both names come from the connector's release
  -- manifest, which validates them before a run.
  insert into public.ai_tasks (
    initiating_user_id, workspace_id, room_id, device_id, provider, model,
    kind, status, instruction, context_manifest_json
  ) values (
    pass.created_by,
    pass.workspace_id,
    pass.room_id,
    pass.device_id,
    pass.provider,
    case pass.provider
      when 'codex' then 'gpt-5.4'
      when 'claude' then 'claude-haiku-4-5'
    end,
    'design_component_build',
    'queued',
    'Build ' || array_to_string(batch, ', '),
    '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb
  )
  returning id into new_task_id;

  insert into public.design_component_builds (task_id, pass_id, component_names, attempt)
  values (new_task_id, pass.id, batch, target_attempt);

  return new_task_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- The materializer
-- ---------------------------------------------------------------------------
-- Unchanged from 202608270002 apart from three things:
--
--   * the whole body now runs inside a block with `exception when others`,
--     making good on this function's own header. An AFTER trigger on
--     `ai_tasks` that raises aborts `settle_ai_task`, so the connector cannot
--     settle the task at all and the run wedges non-terminally -- strictly
--     worse than not merging. `materialize_design_profile_distill`
--     (202608270008) already guards its own queue call this way; this guards
--     the whole body, because the raise surfaces are not confined to one
--     statement (`ai_tasks_instruction_length` on the nested queue INSERT is
--     the likeliest, but it is not the only one).
--
--   * the version the merge inserts recompiles `component_css` from the
--     merged profile instead of copying the source version's forward. See
--     the note on `compile_design_component_css` above.
--
--   * a batch that ends in `needs_review` advances the pass rather than
--     leaving it parked. That status is where `settle_ai_task` sends
--     `malformed_output`, and nobody reviews a batch of components -- so
--     before this the pass simply stopped there. `materialized_at` is
--     stamped (the column means "the trigger has finished considering this
--     batch", merge or no merge), which also means a `needs_review` batch
--     somebody later drives to `completed` will not merge a second time on
--     top of whatever the pass has done since.
--
--     `failed`, `cancelled`, `usage_limit_reached` and
--     `needs_reauthentication` deliberately do NOT advance the pass: the
--     design says a batch that fails entirely stops the pass with the active
--     pointer where it was, and auto-requeueing a batch a person has just
--     cancelled would defeat the cancel. Those now resume properly when the
--     person presses the button, which is what the liveness change above
--     fixes.
create or replace function public.materialize_design_component_build()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  build public.design_component_builds;
  pass public.design_component_build_passes;
  target_profile jsonb;
  built jsonb;
  merged jsonb;
  new_version_id uuid;
  still_missing text[];
begin
  if new.kind <> 'design_component_build' then
    return new;
  end if;

  begin
    -- A batch the connector could not produce usable output for. Nothing to
    -- merge, but the pass must not stop here: no one reviews a component
    -- build, so `needs_review` is terminal in practice.
    if new.status = 'needs_review' then
      select * into build from public.design_component_builds
      where task_id = new.id
      for update;
      if not found or build.materialized_at is not null then return new; end if;

      select * into pass from public.design_component_build_passes
      where id = build.pass_id
      for update;
      if not found or pass.completed_at is not null then return new; end if;

      update public.design_component_builds
      set materialized_at = now()
      where task_id = new.id;

      begin
        perform public.queue_design_component_build_batch(pass.id, 1);
      exception when others then
        raise warning
          'design_component_build % parked but could not queue the next batch: %',
          new.id, sqlerrm;
      end;
      return new;
    end if;

    -- A batch that did not complete leaves the pass where it is: the active
    -- pointer never moved, so the person keeps the design system they had,
    -- and the next run resumes this pass and re-sends what is still missing.
    if new.status <> 'completed' then
      return new;
    end if;

    -- Update 1 of the settle pair: the status is already terminal but the
    -- result has not been written yet. There is nothing to merge, and saying
    -- so here is what lets update 2 do the work.
    if new.result_json is null then
      return new;
    end if;

    -- A partial result is a run that was cut off, settled terminally so the
    -- gateway sees an ordinary settlement. Every sibling materializer refuses
    -- it; merging one would write half a component set as though it were the
    -- whole answer.
    if coalesce(new.result_json ->> 'partial', 'false') <> 'false' then
      return new;
    end if;

    -- Locked, then checked: two updates of one settlement can reach this
    -- point concurrently only if something outside the settle path touches
    -- the row, but the lock makes the "have I already done this?" answer
    -- trustworthy either way.
    select * into build from public.design_component_builds
    where task_id = new.id
    for update;
    if not found or build.materialized_at is not null then return new; end if;

    select * into pass from public.design_component_build_passes
    where id = build.pass_id
    for update;
    if not found or pass.completed_at is not null then return new; end if;

    -- Everything below is shape-checked rather than trusted; see the note
    -- above this function on why raising is not an option.
    built := new.result_json -> 'payload' -> 'components';
    if built is null or jsonb_typeof(built) <> 'array' then
      built := '[]'::jsonb;
    else
      select coalesce(jsonb_agg(element), '[]'::jsonb) into built
      from jsonb_array_elements(built) as element
      where jsonb_typeof(element) = 'object'
        and jsonb_typeof(element -> 'name') = 'string';
    end if;

    select version.profile_json into target_profile
    from public.design_system_profile_versions as version
    where version.id = pass.target_version_id;

    merged := null;

    if jsonb_array_length(built) > 0
      and jsonb_typeof(target_profile -> 'components') = 'array'
    then
      -- Merge by name: a built component replaces its prose-only entry in
      -- place, keeping the profile's own ordering and every field the model
      -- did not return (a description, a usage note) by concatenating onto it
      -- rather than replacing it.
      select jsonb_set(
        target_profile,
        '{components}',
        coalesce(jsonb_agg(
          case
            when jsonb_typeof(entry.component) = 'object'
              and exists (
                select 1 from jsonb_array_elements(built) as candidate
                where candidate ->> 'name' = entry.component ->> 'name'
              )
            then entry.component || (
              select candidate from jsonb_array_elements(built) as candidate
              where candidate ->> 'name' = entry.component ->> 'name'
              limit 1
            )
            else entry.component
          end
          order by entry.ordinality
        ), '[]'::jsonb)
      ) into merged
      from jsonb_array_elements(target_profile -> 'components')
        with ordinality as entry(component, ordinality);
    end if;

    -- Written as a NEW version rather than in place. `design_profile_version_immutable`
    -- (202608130005) refuses every update to this table, and it refuses it for
    -- a reason: a version id is the cache key everything downstream pins to --
    -- the hydrated design context, the screens that record
    -- `profile_version_id` -- so a row whose contents changed under a fixed id
    -- would leave every one of them quietly describing something that no
    -- longer exists. The pass's target therefore steps forward one version per
    -- merged batch, and the intermediate rows stay exactly as private as the
    -- first copy was: nothing points at them until the pass finishes and moves
    -- the active pointer.
    --
    -- `design_profile_version_size` caps `profile_json` at 64 KiB. A whole
    -- pass over the largest profile seen lands around 30 KiB, so this is a
    -- backstop rather than a limit anyone should meet -- but meeting it must
    -- not raise, so an oversized merge is dropped and the batch simply builds
    -- nothing.
    if merged is not null
      and pg_catalog.octet_length(merged::text) <= 65536
    then
      insert into public.design_system_profile_versions (
        workspace_id, profile_json, token_css, component_css,
        source_object_path, created_by
      )
      select version.workspace_id, merged, version.token_css,
        -- Recompiled, not copied. Copying is what made every reader of this
        -- column describe the design system as it was BEFORE the pass.
        public.compile_design_component_css(merged),
        version.source_object_path, pass.created_by
      from public.design_system_profile_versions as version
      where version.id = pass.target_version_id
      returning id into new_version_id;

      update public.design_component_build_passes
      set target_version_id = new_version_id
      where id = pass.id;

      pass.target_version_id := new_version_id;
    end if;

    -- Stamped before the pass is advanced, so that whatever else touches this
    -- task row afterwards finds the work already recorded as done.
    update public.design_component_builds
    set materialized_at = now(),
        merged_version_id = new_version_id
    where task_id = new.id;

    -- A component still missing after its batch completed failed validation in
    -- the connector. It is retried once, then left as prose.
    still_missing := array(
      select name from unnest(build.component_names) as name
      where name = any(public.pending_design_components(pass.target_version_id))
    );

    -- Queued inside a handler of its own, not just the outer one, so that a
    -- failure to queue the NEXT batch does not roll back the merge this batch
    -- just earned. `queue_design_component_build_batch` inserts into
    -- `ai_tasks`, whose `ai_tasks_instruction_length` check the instruction
    -- 'Build <names>' can breach for a profile with pathological component
    -- names. Losing the next batch leaves a pass a person can resume by
    -- pressing the button; losing the merge would throw away a provider run.
    begin
      if coalesce(array_length(still_missing, 1), 0) > 0 and build.attempt = 1 then
        perform public.queue_design_component_build_batch(pass.id, 2);
      else
        perform public.queue_design_component_build_batch(pass.id, 1);
      end if;
    exception when others then
      raise warning
        'design_component_build % merged but could not queue the next batch: %',
        new.id, sqlerrm;
    end;
  exception when others then
    raise warning
      'design_component_build % settled but could not be materialized: %',
      new.id, sqlerrm;
  end;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- The repair path goes away
-- ---------------------------------------------------------------------------
-- 202608270004 punched a hole in this table's immutability so that
-- `recompileComponentCss` (apps/web) could overwrite a version's stale
-- `component_css` from the browser side. With the merge producing the column
-- correctly there is nothing left to repair, so the hole closes: profile
-- versions are once again immutable in every column, which is the invariant
-- everything that pins a `profile_version_id` actually depends on.
--
-- This also retires the `like '%</%'` guard in `set_design_component_css`,
-- which was rejecting exactly the `url("data:image/svg+xml,<svg ... </svg>")`
-- values the build prompt requires -- and doing it into a `console.error`, so
-- a design system whose components used an inline SVG background would have
-- had a permanently stale stylesheet and no visible sign of it.
create or replace function public.protect_design_profile_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'design_profile_version_immutable' using errcode = 'P0001';
  return null;
end;
$$;

drop function if exists public.set_design_component_css(uuid, text);
