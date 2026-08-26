-- 202608270005 fixed start_design_component_build trusting an unchecked
-- target_provider argument by reading default_provider out of the same
-- ai_user_preferences row default_device_id already comes from -- reasoning
-- that the pair is safe because both write paths that ever set it
-- (settle_provider_setup_request, set_ai_user_preference in
-- 202607290001_provider_setup.sql) require a live provider_connections row
-- for that exact device at the moment they write it.
--
-- That reasoning covers "safe when written," not "still true when read."
-- Nothing clears default_provider when a provider later drops off a device:
-- upsert_provider_connections (202607280001) replaces a device's connection
-- rows on every heartbeat and simply omits ones the connector no longer
-- reports, but ai_user_preferences is not among the tables it touches. So a
-- preference can point at a provider the device no longer has -- the same
-- failure 202608270005 closed for an unchecked function argument, just
-- narrower: reached by a stale column instead of a caller's input, but
-- identical once reached (queue_design_component_build_batch inserts into
-- ai_tasks directly, bypassing create_ai_task's own compatibility check, so
-- the pass would still queue a task nothing can claim, wedging the
-- workspace's one open-pass slot).
--
-- The bar to clear is create_ai_task's own check (202607280001_ai_tasks.sql,
-- lines 321-329): a provider_connections row exists for this exact
-- (device_id, user_id, provider) triple. Nothing stronger -- installed,
-- authenticated, supported readiness is a live-status question
-- resolveAgentReadiness already answers for the UI (and is exactly why the
-- UI and the RPC can still show/queue different providers for a device that
-- is connected but momentarily signed out; that gap is not what this
-- migration closes). This migration closes the one create_ai_task's sibling
-- direct-insert path was missing entirely: a provider connection that does
-- not exist at all for this device.
create or replace function public.start_design_component_build(
  target_room_id uuid,
  target_provider public.ai_provider
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
  if not coalesce(public.can_edit_room(target_room_id), false) then
    raise insufficient_privilege using message = 'design_system_not_editable';
  end if;

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
  select id into new_pass_id
  from public.design_component_build_passes
  where workspace_id = target_workspace_id and completed_at is null
  order by created_at desc
  limit 1;

  if new_pass_id is not null then
    perform public.queue_design_component_build_batch(new_pass_id, 1);
    return new_pass_id;
  end if;

  -- The caller's own paired device and its provider, resolved together from
  -- the one row that guarantees they were a runnable pair at the moment it
  -- was written (see header comment). Without a device there is nothing to
  -- run the build on, and a pass whose tasks can never be claimed would sit
  -- queued for ever.
  select preference.default_device_id, preference.default_provider
  into resolved_device_id, resolved_provider
  from public.ai_user_preferences as preference
  where preference.user_id = auth.uid();

  if resolved_device_id is null then
    raise exception using errcode = 'P0001', message = 'no_execution_device';
  end if;

  -- The pairing can go stale after it was written (see header comment): a
  -- provider the device no longer reports leaves this row untouched. Checked
  -- here at read time, at the same bar create_ai_task holds every other task
  -- creation path to -- existence only, not live readiness -- so a pass
  -- never queues a task against a connection that no longer exists at all.
  if not exists (
    select 1
    from public.provider_connections as connection
    where connection.device_id = resolved_device_id
      and connection.user_id = auth.uid()
      and connection.provider = resolved_provider
  ) then
    raise exception using errcode = 'P0001', message = 'provider_not_connected';
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
      active_version.source_object_path, auth.uid()
    )
    returning id into new_version_id;

    insert into public.design_component_build_passes (
      workspace_id, room_id, source_version_id, target_version_id,
      provider, device_id, created_by
    ) values (
      target_workspace_id, target_room_id, active_version.id, new_version_id,
      resolved_provider, resolved_device_id, auth.uid()
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
