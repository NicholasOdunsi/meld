-- start_design_component_build trusted its caller's target_provider
-- argument for the pass's provider column, but the task that provider gets
-- queued against runs on resolved_device_id -- the caller's own default
-- device, resolved right above it in the same function. Nothing checked
-- that the two actually go together.
--
-- That matters because queue_design_component_build_batch inserts straight
-- into ai_tasks (202608270002), deliberately bypassing create_ai_task -- the
-- only place a device/provider compatibility check lives
-- (202607280001_ai_tasks.sql, the provider_connections existence check in
-- create_ai_task). A Claude-only user (a device with a provider_connections
-- row for claude, and none for codex) who starts a pass with target_provider
-- = 'codex' -- exactly what the Design System page's button did before this
-- migration -- got a pass whose every batch queues a codex task pinned to
-- codex's fast-tier model, on a device that cannot run codex at all. That
-- task can never be claimed, and per design_component_build_passes_one_open
-- it occupies the workspace's one open-pass slot for good.
--
-- Fixed at the source rather than in every caller: ai_user_preferences
-- already pairs default_device_id with default_provider, and that pairing is
-- never written except behind a provider_connections check (both
-- settle_provider_setup_request's "first ready connection becomes the
-- default" and set_ai_user_preference's own explicit check require an
-- installed, authenticated, supported connection for that exact device
-- before the pair is saved -- see 202607290001_provider_setup.sql). Reading
-- default_provider out of that same row the function already reads
-- default_device_id from is therefore guaranteed to name a provider that
-- device can actually run -- unlike target_provider, which is caller-supplied
-- and unchecked.
--
-- target_provider stays in the signature: it is a public RPC (Task 6/8),
-- already called with two positional arguments by the web action and by
-- supabase/tests/design_component_build.test.sql, and this fix does not
-- require changing either. It is simply no longer trusted for the value
-- that matters -- the resumption path a few lines above this never used it
-- either, since a resumed pass always carries the provider it started with.
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
  -- the one row that guarantees they are a runnable pair (see header
  -- comment). Without a device there is nothing to run the build on, and a
  -- pass whose tasks can never be claimed would sit queued for ever.
  select preference.default_device_id, preference.default_provider
  into resolved_device_id, resolved_provider
  from public.ai_user_preferences as preference
  where preference.user_id = auth.uid();

  if resolved_device_id is null then
    raise exception using errcode = 'P0001', message = 'no_execution_device';
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
