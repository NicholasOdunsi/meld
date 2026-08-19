-- Store component-level CSS alongside token CSS on each design profile
-- version and write it in the distill materializer. componentCss is
-- optional in the distill payload for back-compat with prior connector
-- outputs. It is NOT added to the design-screen-generate hydration context:
-- AIContextPackageSchema.designProfile is `.strict()` and only allows
-- { versionId, profile, tokenCss }, and the connector never reads
-- designProfile.componentCss from the hydrated context anyway -- the
-- screen-gen prompt reads profile.components[].html, and the web render
-- reads the component_css column directly. The column stays available for
-- the web render's direct column reads.
alter table public.design_system_profile_versions
  add column component_css text,
  add constraint design_system_profile_versions_component_css_size
    check (component_css is null or octet_length(component_css) <= 65536);

-- Live body copied verbatim from 202608130010_design_task_rpcs.sql:560-634
-- (public.materialize_design_profile_distill), with two edits:
--   (a) the payload guard still only requires `profile` + `tokenCss`;
--       `componentCss` stays optional (no added requirement).
--   (b) the INSERT gains `component_css` from `payload ->> 'componentCss'`,
--       which is null when the key is absent.
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

  return new;
end;
$$;

-- Note: the two-argument public.hydrate_authorized_room_context wrapper has
-- been chain-renamed by later migrations (202608140002, 202608150007), so
-- the live function that builds the `tokenCss` design-profile context is no
-- longer named `hydrate_authorized_room_context` -- it is
-- `hydrate_authorized_room_context_pre_user_flow_assist` (the name
-- 202608140002 renamed it to when it wrapped it to add `existingFlow`).
-- Body copied verbatim from 202608130010_design_task_rpcs.sql:744-836
-- (the original public.hydrate_authorized_room_context body), unchanged:
-- `componentCss` is deliberately NOT added here (see header comment above).
create or replace function public.hydrate_authorized_room_context_pre_user_flow_assist(
  target_task_id uuid,
  target_attempt_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  hydrated_result jsonb;
  hydrated_context jsonb;
  profile_context jsonb;
  screen_context jsonb;
  target_device_id uuid;
begin
  hydrated_result := public.hydrate_authorized_room_context_pre_design(
    target_task_id,
    target_attempt_id
  );

  if hydrated_result ->> 'status' <> 'ready'
    or hydrated_result #>> '{context,kind}' <> 'design_screen_generate'
  then
    return hydrated_result;
  end if;

  select case
      when version.id is null then null
      else jsonb_build_object(
        'versionId', version.id,
        'profile', version.profile_json,
        'tokenCss', version.token_css
      )
    end
  into profile_context
  from public.design_screen_generations as generation
  left join public.design_system_profile_versions as version
    on version.id = generation.profile_version_id
  where generation.task_id = target_task_id;

  select jsonb_build_object(
    'screenId', screen.id,
    'flowNodeId', screen.flow_node_id,
    'baseVersionId', generation.base_version_id,
    'currentVersion', case
      when version.id is null then null
      else jsonb_build_object(
        'id', version.id,
        'markup', version.markup,
        'styles', version.styles,
        'actions', version.actions_json
      )
    end
  )
  into screen_context
  from public.design_screen_generations as generation
  join public.design_screens as screen on screen.id = generation.screen_id
  left join public.design_screen_versions as version
    on version.id = generation.base_version_id
  where generation.task_id = target_task_id;

  hydrated_context := hydrated_result -> 'context';
  hydrated_context := hydrated_context
    || jsonb_build_object(
      'designProfile', profile_context,
      'designScreen', screen_context
    );

  if octet_length(hydrated_context::text) > 524288 then
    select task.device_id into target_device_id
    from public.ai_tasks as task
    where task.id = target_task_id;

    perform public.settle_ai_task(
      target_task_id,
      target_device_id,
      target_attempt_id,
      'fail',
      'unknown',
      'Hydrated AI task context exceeds 512 KiB.',
      null,
      false
    );
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'context_too_large'
    );
  end if;

  return jsonb_set(hydrated_result, '{context}', hydrated_context);
end;
$$;
