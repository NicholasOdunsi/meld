-- A design system that has just been distilled is only half built. The
-- distiller emits real html/css for eight hardcoded core components and
-- leaves every other component it found as prose, so the person who uploaded
-- a reference gets a profile whose component inventory is mostly description.
-- A component build pass finishes that off, and until now somebody had to
-- press a button to start one. This migration starts it for them: a
-- distillation that lands with prose-only components queues the pass itself.
--
-- On the file number. This work was reserved 202608270006, but the migration
-- below must be the LAST definition of `public.start_design_component_build`
-- and 202608270007 already redefines it -- migrations replay in filename
-- order, so a 202608270006 that reduced the RPC to a wrapper would be undone
-- moments later by 202608270007's full body, leaving the extracted copy and
-- the RPC's own copy to drift apart. That is precisely the duplication this
-- task exists to avoid, so the file takes the next free number after the
-- migration it must follow. 202608270006 is left unused.
--
-- On the extraction. `start_design_component_build` did two separable things:
-- it decided whether the CALLER may start a pass, and it started one. Only
-- the first half needs a session -- `auth.uid()`, and a `can_edit_room` check
-- against it -- and a trigger has no session at all. So the second half moves
-- wholesale into `start_design_component_build_unchecked`, which takes the
-- acting user (and optionally the device and provider) as arguments, and the
-- RPC becomes the permission check plus a call. There is exactly one copy of
-- the body; the RPC and the trigger reach it by different doors.

-- Starts a pass for a room without asking whether anyone may: copies the
-- active version, then queues the first batch. Every caller must have decided
-- for itself that the work is allowed -- `start_design_component_build` by
-- checking `can_edit_room`, `materialize_design_profile_distill` by the fact
-- that the distillation it is finishing was itself authorized when it was
-- queued.
--
-- `target_device_id` and `target_provider` are the pair the pass will run on.
-- Supply BOTH to pin the pass to a known-good pair, or NEITHER to have the
-- acting user's own default pair resolved and checked here (what the RPC
-- does, and what this function did inline before the extraction). The trigger
-- supplies both, from the task that just ran: that device demonstrably ran
-- that provider seconds ago, which is stronger evidence than the
-- `ai_user_preferences` row the resolution path has to settle for -- and
-- re-resolving would mean a preference the person changed between uploading
-- the reference and the distillation landing silently redirected the pass.
create function public.start_design_component_build_unchecked(
  target_room_id uuid,
  target_provider public.ai_provider,
  acting_user_id uuid,
  target_device_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_workspace_id uuid;
  active_version public.design_system_profile_versions;
  new_version_id uuid;
  new_pass_id uuid;
  resolved_device_id uuid;
  resolved_provider public.ai_provider;
begin
  select room.workspace_id into target_workspace_id
  from public.rooms as room where room.id = target_room_id;

  select version.* into active_version
  from public.design_system_profiles as profile
  join public.design_system_profile_versions as version
    on version.id = profile.active_version_id
  where profile.workspace_id = target_workspace_id;

  if active_version.id is null then
    raise exception using errcode = 'P0001', message = 'no_active_design_system';
  end if;

  -- An unfinished pass for this workspace is resumed rather than duplicated,
  -- so pressing the button twice cannot run two passes over one profile. The
  -- queue declines on its own when a batch is still in flight, so a second
  -- press during a run is a no-op rather than a duplicate batch.
  --
  -- Deliberately ahead of every device and provider question below: a resumed
  -- pass carries the device and provider it started with, so resuming one is
  -- possible even for a caller whose own pairing has since gone stale.
  select id into new_pass_id
  from public.design_component_build_passes
  where workspace_id = target_workspace_id and completed_at is null
  order by created_at desc
  limit 1;

  if new_pass_id is not null then
    perform public.queue_design_component_build_batch(new_pass_id, 1);
    return new_pass_id;
  end if;

  if target_device_id is not null and target_provider is not null then
    -- A pair the caller already knows to be runnable. Taken as given: the
    -- only caller that supplies one hands over the device and provider of a
    -- task that has just finished running on them.
    resolved_device_id := target_device_id;
    resolved_provider := target_provider;
  else
    -- The acting user's own paired device and its provider, resolved together
    -- from the one row that guarantees they were a runnable pair at the
    -- moment it was written (202608270005). Without a device there is nothing
    -- to run the build on, and a pass whose tasks can never be claimed would
    -- sit queued for ever.
    select preference.default_device_id, preference.default_provider
    into resolved_device_id, resolved_provider
    from public.ai_user_preferences as preference
    where preference.user_id = acting_user_id;

    if resolved_device_id is null then
      raise exception using errcode = 'P0001', message = 'no_execution_device';
    end if;

    -- The pairing can go stale after it was written (202608270007): a
    -- provider the device no longer reports leaves this row untouched.
    -- Checked here at read time, at the same bar create_ai_task holds every
    -- other task creation path to -- existence only, not live readiness -- so
    -- a pass never queues a task against a connection that no longer exists
    -- at all.
    if not exists (
      select 1
      from public.provider_connections as connection
      where connection.device_id = resolved_device_id
        and connection.user_id = acting_user_id
        and connection.provider = resolved_provider
    ) then
      raise exception using errcode = 'P0001', message = 'provider_not_connected';
    end if;
  end if;

  -- The copy and the pass go in together so that losing the race to another
  -- caller rolls back both -- the read above cannot see a pass a concurrent
  -- transaction has not committed yet, so the partial unique index is what
  -- actually decides who starts the pass. The loser resumes the winner's.
  begin
    insert into public.design_system_profile_versions (
      workspace_id, profile_json, token_css, component_css,
      source_object_path, created_by
    ) values (
      active_version.workspace_id, active_version.profile_json,
      active_version.token_css, active_version.component_css,
      active_version.source_object_path, acting_user_id
    )
    returning id into new_version_id;

    insert into public.design_component_build_passes (
      workspace_id, room_id, source_version_id, target_version_id,
      provider, device_id, created_by
    ) values (
      target_workspace_id, target_room_id, active_version.id, new_version_id,
      resolved_provider, resolved_device_id, acting_user_id
    )
    returning id into new_pass_id;
  exception when unique_violation then
    select id into new_pass_id
    from public.design_component_build_passes
    where workspace_id = target_workspace_id and completed_at is null
    order by created_at desc
    limit 1;

    if new_pass_id is null then
      raise;
    end if;
  end;

  perform public.queue_design_component_build_batch(new_pass_id, 1);
  return new_pass_id;
end;
$$;

-- The public door onto the function above: may this caller start a pass on
-- this room, and if so, start one on the caller's own device.
--
-- `target_provider` stays in the signature and stays unused. It has been
-- ignored since 202608270005 -- the provider a pass runs on is resolved from
-- the pairing that guarantees the device can actually run it, never from a
-- caller's argument -- but this is a public RPC called with two positional
-- arguments by apps/web/src/features/design/component-build.ts and by
-- supabase/tests/design_component_build.test.sql, and dropping the argument
-- would break both for no gain.
create or replace function public.start_design_component_build(
  target_room_id uuid,
  target_provider public.ai_provider
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.can_edit_room(target_room_id), false) then
    raise insufficient_privilege using message = 'design_system_not_editable';
  end if;

  -- Nulls for the pair, so the acting user's own default device and provider
  -- are resolved and checked inside -- and, as before the extraction, only
  -- once an open pass has been ruled out.
  return public.start_design_component_build_unchecked(
    target_room_id,
    null::public.ai_provider,
    auth.uid(),
    null::uuid
  );
end;
$$;

-- The distill materializer, unchanged from
-- 20260819000001_design_profile_component_css.sql except for the block at the
-- end that queues the pass.
--
-- Two things about that block.
--
-- It comes AFTER the `design_system_profiles` upsert, not directly after the
-- `design_profile_distills` update as this task was originally sketched.
-- `start_design_component_build_unchecked` copies the workspace's ACTIVE
-- version, and until that upsert runs the active pointer still names the
-- design system this distillation replaces -- so the pass would have been
-- started over the OLD profile (or, for a first-ever distillation, raised
-- `no_active_design_system` because there was no pointer at all).
--
-- And it cannot raise. This is an AFTER trigger on `ai_tasks`, so an
-- exception here aborts the whole of `settle_ai_task`: the connector could
-- not settle the distillation at all, and a run that produced a perfectly
-- good design system would wedge over a failure to queue its follow-up. The
-- reachable failures are real if unlikely -- `ai_tasks_instruction_length`
-- against a profile full of pathologically long component names, a provider
-- with no fast-tier model mapping -- and every one of them is a reason to
-- leave the design system landed and the pass unstarted, never a reason to
-- lose the design system. Recorded as a warning rather than swallowed in
-- silence, so a failure is at least visible in the server log.
create or replace function public.materialize_design_profile_distill()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload jsonb;
  distill public.design_profile_distills;
  new_version uuid;
begin
  if new.kind <> 'design_profile_distill'
    or new.status <> 'completed'
    or new.result_json is null
    or coalesce(new.result_json ->> 'partial', 'false') <> 'false'
  then
    return new;
  end if;

  select * into distill
  from public.design_profile_distills
  where task_id = new.id;

  if distill.task_id is null then
    return new;
  end if;

  if distill.version_id is not null then
    return new;
  end if;

  payload := new.result_json -> 'payload';
  if payload is null
    or jsonb_typeof(payload) <> 'object'
    or jsonb_typeof(payload -> 'profile') <> 'object'
    or jsonb_typeof(payload -> 'tokenCss') <> 'string'
  then
    return new;
  end if;

  insert into public.design_system_profile_versions (
    workspace_id,
    profile_json,
    token_css,
    component_css,
    source_object_path,
    created_by
  ) values (
    distill.workspace_id,
    payload -> 'profile',
    payload ->> 'tokenCss',
    payload ->> 'componentCss',
    distill.source_object_path,
    new.initiating_user_id
  )
  returning id into new_version;

  update public.design_profile_distills
  set version_id = new_version
  where task_id = new.id;

  insert into public.design_system_profiles as profile (
    workspace_id,
    active_version_id,
    updated_at
  ) values (
    distill.workspace_id,
    new_version,
    now()
  )
  on conflict (workspace_id) do update
  set active_version_id = excluded.active_version_id,
      updated_at = now();

  -- A distilled system that still has prose-only components is only half
  -- built. Queue the pass that finishes it, on the device and provider that
  -- just did the distillation -- that device is by definition paired and
  -- working. The pass builds into a copy, so nothing the person is looking at
  -- changes until it lands.
  begin
    if coalesce(
      pg_catalog.array_length(public.pending_design_components(new_version), 1),
      0
    ) > 0 then
      perform public.start_design_component_build_unchecked(
        distill.room_id,
        new.provider,
        new.initiating_user_id,
        new.device_id
      );
    end if;
  exception when others then
    raise warning
      'design_profile_distill % landed but could not queue a component build: %',
      new.id, sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function public.start_design_component_build_unchecked(
  uuid, public.ai_provider, uuid, uuid
) from public, anon, authenticated, service_role;
