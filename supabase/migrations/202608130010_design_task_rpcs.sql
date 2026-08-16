-- Narrow request tracking. Browser clients read these tables but never the
-- private ai_tasks result envelope.
create table public.design_profile_distills (
  task_id uuid primary key references public.ai_tasks(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  source_object_path text,
  version_id uuid references public.design_system_profile_versions(id),
  created_at timestamptz not null default now()
);

create table public.design_screen_generations (
  task_id uuid primary key references public.ai_tasks(id) on delete cascade,
  screen_id uuid not null references public.design_screens(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  base_version_id uuid references public.design_screen_versions(id),
  profile_version_id uuid references public.design_system_profile_versions(id),
  created_at timestamptz not null default now()
);

alter table public.design_profile_distills enable row level security;
revoke all on table public.design_profile_distills from anon, authenticated;
grant select on table public.design_profile_distills to authenticated;
create policy "Members can view profile distills"
on public.design_profile_distills for select to authenticated
using (public.is_workspace_member(workspace_id));

alter table public.design_screen_generations enable row level security;
revoke all on table public.design_screen_generations from anon, authenticated;
grant select on table public.design_screen_generations to authenticated;
create policy "Participants can view screen generations"
on public.design_screen_generations for select to authenticated
using (public.is_room_participant(room_id));

alter table public.design_screen_versions
  add constraint design_screen_version_task_fkey
  foreign key (originating_task_id)
  references public.ai_tasks(id) on delete set null;

create unique index design_screen_versions_originating_task
  on public.design_screen_versions(originating_task_id)
  where originating_task_id is not null;

create function public.get_design_screen_generation(target_task_id uuid)
returns table (
  task_id uuid,
  screen_id uuid,
  version_id uuid,
  promoted boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select generation.task_id,
    generation.screen_id,
    version.id,
    version.promoted
  from public.design_screen_generations as generation
  left join public.design_screen_versions as version
    on version.originating_task_id = generation.task_id
  where generation.task_id = target_task_id
    and public.is_room_participant(generation.room_id);
$$;

revoke all on function public.get_design_screen_generation(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_design_screen_generation(uuid)
  to authenticated;

create function public.get_design_profile_distillation(target_task_id uuid)
returns table (
  task_id uuid,
  version_id uuid,
  is_active boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select distill.task_id,
    version.id,
    version.id = profile.active_version_id as is_active
  from public.design_profile_distills as distill
  left join public.design_system_profile_versions as version
    on version.id = distill.version_id
  left join public.design_system_profiles as profile
    on profile.workspace_id = distill.workspace_id
  where distill.task_id = target_task_id
    and public.is_workspace_member(distill.workspace_id)
  limit 1;
$$;

revoke all on function public.get_design_profile_distillation(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_design_profile_distillation(uuid)
  to authenticated;

create function public.create_design_profile_distill_task(
  target_room_id uuid,
  target_provider public.ai_provider default null,
  source_object_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_workspace_id uuid;
  resolved_device_id uuid;
  resolved_provider public.ai_provider;
  frozen_manifest jsonb;
  result_task public.ai_tasks%rowtype;
begin
  if caller_id is null or not public.can_edit_room(target_room_id) then
    raise exception 'invalid_design_profile_distill_request' using errcode = 'P0001';
  end if;

  select room.workspace_id into target_workspace_id
  from public.rooms as room
  where room.id = target_room_id;

  if target_workspace_id is null then
    raise exception 'invalid_design_profile_distill_request' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'design_profile_distill:' || target_room_id::text,
      0
    )
  );

  select task.* into result_task
  from public.ai_tasks as task
  where task.room_id = target_room_id
    and task.initiating_user_id = caller_id
    and task.kind = 'design_profile_distill'
    and task.status in (
      'queued',
      'waiting_for_device',
      'ready_to_run',
      'running'
    )
  order by task.created_at, task.id
  limit 1;

  if result_task.id is not null then
    return jsonb_build_object(
      'id', result_task.id,
      'roomId', result_task.room_id,
      'provider', result_task.provider,
      'kind', result_task.kind,
      'status', result_task.status,
      'createdAt', result_task.created_at,
      'updatedAt', result_task.updated_at
    );
  end if;

  select preference.default_device_id,
    coalesce(target_provider, preference.default_provider)
  into resolved_device_id, resolved_provider
  from public.ai_user_preferences as preference
  where preference.user_id = caller_id;

  if resolved_device_id is null
    or resolved_provider is null
    or not exists (
      select 1
      from public.execution_devices as device
      where device.id = resolved_device_id
        and device.user_id = caller_id
        and device.status = 'active'
        and device.revoked_at is null
    )
    or not exists (
      select 1
      from public.provider_connections as connection
      where connection.device_id = resolved_device_id
        and connection.user_id = caller_id
        and connection.provider = resolved_provider
        and connection.installation = 'installed'
        and connection.authentication = 'authenticated'
        and connection.compatibility = 'supported'
    )
  then
    raise exception 'invalid_design_profile_distill_request' using errcode = 'P0001';
  end if;

  frozen_manifest := jsonb_build_object(
    'messageIds', (
      select coalesce(
        jsonb_agg(message.id order by message.created_at, message.id),
        '[]'::jsonb
      )
      from public.messages as message
      where message.room_id = target_room_id
    ),
    'attachmentIds', (
      select coalesce(
        jsonb_agg(attachment.id order by attachment.created_at, attachment.id),
        '[]'::jsonb
      )
      from public.attachments as attachment
      where attachment.room_id = target_room_id
        and attachment.message_id is not null
        and attachment.discard_pending = false
    ),
    'evidenceIds', (
      select coalesce(
        jsonb_agg(evidence.id order by evidence.created_at, evidence.id),
        '[]'::jsonb
      )
      from public.evidence as evidence
      where evidence.room_id = target_room_id
    ),
    'decisionIds', (
      select coalesce(
        jsonb_agg(decision.id order by decision.created_at, decision.id),
        '[]'::jsonb
      )
      from public.decisions as decision
      where decision.room_id = target_room_id
    )
  );

  insert into public.ai_tasks (
    initiating_user_id,
    workspace_id,
    room_id,
    device_id,
    provider,
    kind,
    status,
    instruction,
    context_manifest_json,
    context_revision
  ) values (
    caller_id,
    target_workspace_id,
    target_room_id,
    resolved_device_id,
    resolved_provider,
    'design_profile_distill',
    'queued',
    'Distill the authorized design-system source into a validated profile.',
    frozen_manifest,
    0
  )
  returning * into result_task;

  insert into public.design_profile_distills (
    task_id,
    workspace_id,
    room_id,
    source_object_path
  ) values (
    result_task.id,
    target_workspace_id,
    target_room_id,
    source_object_path
  );

  return jsonb_build_object(
    'id', result_task.id,
    'roomId', result_task.room_id,
    'provider', result_task.provider,
    'kind', result_task.kind,
    'status', result_task.status,
    'createdAt', result_task.created_at,
    'updatedAt', result_task.updated_at
  );
exception when unique_violation then
  select task.* into result_task
  from public.ai_tasks as task
  where task.room_id = target_room_id
    and task.initiating_user_id = caller_id
    and task.kind = 'design_profile_distill'
    and task.status in (
      'queued',
      'waiting_for_device',
      'ready_to_run',
      'running'
    )
  order by task.created_at, task.id
  limit 1;

  if result_task.id is null then
    raise exception 'invalid_design_profile_distill_request' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'id', result_task.id,
    'roomId', result_task.room_id,
    'provider', result_task.provider,
    'kind', result_task.kind,
    'status', result_task.status,
    'createdAt', result_task.created_at,
    'updatedAt', result_task.updated_at
  );
end;
$$;

revoke all on function public.create_design_profile_distill_task(
  uuid,
  public.ai_provider,
  text
) from public, anon, authenticated, service_role;
grant execute on function public.create_design_profile_distill_task(
  uuid,
  public.ai_provider,
  text
) to authenticated;

create function public.create_design_screen_generate_task(
  target_screen_id uuid,
  target_provider public.ai_provider default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_screen public.design_screens;
  resolved_device_id uuid;
  resolved_provider public.ai_provider;
  frozen_manifest jsonb;
  active_profile_version uuid;
  result_task public.ai_tasks%rowtype;
begin
  if caller_id is null then
    raise exception 'invalid_design_screen_generate_request' using errcode = 'P0001';
  end if;

  select screen.* into target_screen
  from public.design_screens as screen
  where screen.id = target_screen_id
    and screen.deleted_at is null
  for update;

  if target_screen.id is null
    or not public.can_edit_room(target_screen.room_id)
  then
    raise exception 'invalid_design_screen_generate_request' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'design_screen_generate:' || target_screen_id::text,
      0
    )
  );

  select task.* into result_task
  from public.ai_tasks as task
  join public.design_screen_generations as generation
    on generation.task_id = task.id
  where generation.screen_id = target_screen_id
    and task.kind = 'design_screen_generate'
    and task.status in (
      'queued',
      'waiting_for_device',
      'ready_to_run',
      'running'
    )
  order by task.created_at, task.id
  limit 1;

  if result_task.id is not null then
    return jsonb_build_object(
      'id', result_task.id,
      'roomId', result_task.room_id,
      'provider', result_task.provider,
      'kind', result_task.kind,
      'status', result_task.status,
      'createdAt', result_task.created_at,
      'updatedAt', result_task.updated_at
    );
  end if;

  select preference.default_device_id,
    coalesce(target_provider, preference.default_provider)
  into resolved_device_id, resolved_provider
  from public.ai_user_preferences as preference
  where preference.user_id = caller_id;

  if resolved_device_id is null
    or resolved_provider is null
    or not exists (
      select 1
      from public.execution_devices as device
      where device.id = resolved_device_id
        and device.user_id = caller_id
        and device.status = 'active'
        and device.revoked_at is null
    )
    or not exists (
      select 1
      from public.provider_connections as connection
      where connection.device_id = resolved_device_id
        and connection.user_id = caller_id
        and connection.provider = resolved_provider
        and connection.installation = 'installed'
        and connection.authentication = 'authenticated'
        and connection.compatibility = 'supported'
    )
  then
    raise exception 'invalid_design_screen_generate_request' using errcode = 'P0001';
  end if;

  frozen_manifest := jsonb_build_object(
    'messageIds', (
      select coalesce(
        jsonb_agg(message.id order by message.created_at, message.id),
        '[]'::jsonb
      )
      from public.messages as message
      where message.room_id = target_screen.room_id
    ),
    'attachmentIds', (
      select coalesce(
        jsonb_agg(attachment.id order by attachment.created_at, attachment.id),
        '[]'::jsonb
      )
      from public.attachments as attachment
      where attachment.room_id = target_screen.room_id
        and attachment.message_id is not null
        and attachment.discard_pending = false
    ),
    'evidenceIds', (
      select coalesce(
        jsonb_agg(evidence.id order by evidence.created_at, evidence.id),
        '[]'::jsonb
      )
      from public.evidence as evidence
      where evidence.room_id = target_screen.room_id
    ),
    'decisionIds', (
      select coalesce(
        jsonb_agg(decision.id order by decision.created_at, decision.id),
        '[]'::jsonb
      )
      from public.decisions as decision
      where decision.room_id = target_screen.room_id
    )
  );

  select profile.active_version_id into active_profile_version
  from public.design_system_profiles as profile
  where profile.workspace_id = target_screen.workspace_id;

  insert into public.ai_tasks (
    initiating_user_id,
    workspace_id,
    room_id,
    device_id,
    provider,
    kind,
    status,
    instruction,
    context_manifest_json,
    context_revision
  ) values (
    caller_id,
    target_screen.workspace_id,
    target_screen.room_id,
    resolved_device_id,
    resolved_provider,
    'design_screen_generate',
    'queued',
    'Generate the target design screen from its authorized room context.',
    frozen_manifest,
    0
  )
  returning * into result_task;

  insert into public.design_screen_generations (
    task_id,
    screen_id,
    room_id,
    base_version_id,
    profile_version_id
  ) values (
    result_task.id,
    target_screen.id,
    target_screen.room_id,
    target_screen.current_version_id,
    active_profile_version
  );

  update public.design_screens
  set updating = true,
      updated_at = now()
  where id = target_screen_id;

  perform public.append_design_screen_event(
    target_screen.room_id,
    target_screen_id,
    'generation_started',
    null,
    result_task.id,
    null,
    caller_id
  );

  return jsonb_build_object(
    'id', result_task.id,
    'roomId', result_task.room_id,
    'provider', result_task.provider,
    'kind', result_task.kind,
    'status', result_task.status,
    'createdAt', result_task.created_at,
    'updatedAt', result_task.updated_at
  );
exception when unique_violation then
  select task.* into result_task
  from public.ai_tasks as task
  join public.design_screen_generations as generation
    on generation.task_id = task.id
  where generation.screen_id = target_screen_id
    and task.kind = 'design_screen_generate'
    and task.status in (
      'queued',
      'waiting_for_device',
      'ready_to_run',
      'running'
    )
  order by task.created_at, task.id
  limit 1;

  if result_task.id is null then
    raise exception 'invalid_design_screen_generate_request' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'id', result_task.id,
    'roomId', result_task.room_id,
    'provider', result_task.provider,
    'kind', result_task.kind,
    'status', result_task.status,
    'createdAt', result_task.created_at,
    'updatedAt', result_task.updated_at
  );
end;
$$;

revoke all on function public.create_design_screen_generate_task(
  uuid,
  public.ai_provider
) from public, anon, authenticated, service_role;
grant execute on function public.create_design_screen_generate_task(
  uuid,
  public.ai_provider
) to authenticated;

create function public.materialize_design_profile_distill()
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
    source_object_path,
    created_by
  ) values (
    distill.workspace_id,
    payload -> 'profile',
    payload ->> 'tokenCss',
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

revoke all on function public.materialize_design_profile_distill() from public, anon, authenticated, service_role;
grant execute on function public.materialize_design_profile_distill()
  to service_role;

create trigger ai_tasks_materialize_design_profile_distill
after update on public.ai_tasks
for each row execute function public.materialize_design_profile_distill();

create function public.materialize_design_screen_generate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload jsonb;
  generation public.design_screen_generations;
  version public.design_screen_versions;
begin
  if new.kind <> 'design_screen_generate'
    or new.status <> 'completed'
    or new.result_json is null
    or coalesce(new.result_json ->> 'partial', 'false') <> 'false'
  then
    return new;
  end if;

  select * into generation
  from public.design_screen_generations
  where task_id = new.id;

  if generation.task_id is null then
    return new;
  end if;

  if exists (
    select 1
    from public.design_screen_versions
    where originating_task_id = new.id
  ) then
    return new;
  end if;

  payload := new.result_json -> 'payload';
  if payload is null
    or jsonb_typeof(payload) <> 'object'
    or jsonb_typeof(payload -> 'markup') <> 'string'
    or jsonb_typeof(payload -> 'actions') <> 'array'
  then
    return new;
  end if;

  version := public.insert_and_promote_screen_version(
    generation.screen_id,
    payload ->> 'markup',
    coalesce(payload ->> 'styles', ''),
    payload ->> 'script',
    payload -> 'actions',
    generation.base_version_id,
    generation.profile_version_id,
    new.id,
    new.initiating_user_id
  );

  perform public.append_design_screen_event(
    generation.room_id,
    generation.screen_id,
    'version_created',
    null,
    new.id,
    version.id,
    new.initiating_user_id
  );
  perform public.append_design_screen_event(
    generation.room_id,
    generation.screen_id,
    case
      when version.promoted then 'version_promoted'
      else 'stale_candidate'
    end::public.design_event_kind,
    null,
    new.id,
    version.id,
    new.initiating_user_id
  );

  return new;
end;
$$;

revoke all on function public.materialize_design_screen_generate() from public, anon, authenticated, service_role;
grant execute on function public.materialize_design_screen_generate()
  to service_role;

create trigger ai_tasks_materialize_design_screen_generate
after update on public.ai_tasks
for each row execute function public.materialize_design_screen_generate();

-- Preserve the current hydration implementation and enrich only Design Room
-- screen-generation tasks with their pinned profile and screen base version.
alter function public.hydrate_authorized_room_context(uuid, uuid)
  rename to hydrate_authorized_room_context_pre_design;

revoke all on function public.hydrate_authorized_room_context_pre_design(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.hydrate_authorized_room_context_pre_design(uuid, uuid)
  to service_role;

create function public.hydrate_authorized_room_context(
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

revoke all on function public.hydrate_authorized_room_context(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.hydrate_authorized_room_context(uuid, uuid)
  to service_role;
