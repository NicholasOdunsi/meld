-- Model selection is a room-reply concern. Existing task kinds and old
-- clients remain valid with a null model and the connector's pinned default.
alter table public.ai_tasks
  add column model text;

alter table public.provider_connections
  add column models jsonb not null default '[]'::jsonb,
  add column default_model text,
  add constraint provider_connections_models_array
    check (jsonb_typeof(models) = 'array');

-- Carry model availability through the existing provider status projection.
drop function public.list_execution_devices();

create function public.list_execution_devices()
returns table (
  id uuid,
  name text,
  platform text,
  status public.execution_device_status,
  connector_version text,
  last_seen_at timestamptz,
  created_at timestamptz,
  providers jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    device.id,
    device.name,
    device.platform,
    device.status,
    device.connector_version,
    device.last_seen_at,
    device.created_at,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'provider', connection.provider,
            'installation', connection.installation,
            'version', connection.version,
            'models', connection.models,
            'defaultModel', connection.default_model,
            'authentication', connection.authentication,
            'compatibility', connection.compatibility,
            'lastSeenAt', connection.last_seen_at
          )
        )
        from public.provider_connections as connection
        where connection.device_id = device.id
      ),
      '[]'::jsonb
    ) as providers
  from public.execution_devices as device
  where device.user_id = auth.uid()
    and device.status = 'active'
    and device.revoked_at is null;
$$;

revoke all on function public.list_execution_devices() from public;
revoke all on function public.list_execution_devices()
  from anon, authenticated, service_role;
grant execute on function public.list_execution_devices() to authenticated;

-- The status payload is already authenticated through the device session. Keep
-- the old validation and additionally persist the connector's model list.
create or replace function public.upsert_provider_connections(
  target_device_id uuid,
  target_statuses jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
begin
  select device.user_id
  into target_user_id
  from public.execution_devices as device
  where device.id = target_device_id
    and device.status = 'active'
    and device.revoked_at is null
  for update;

  if target_user_id is null
    or target_statuses is null
    or jsonb_typeof(target_statuses) <> 'array'
    or jsonb_array_length(target_statuses) > 2
  then
    raise exception 'invalid_provider_connections' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(target_statuses) as item
    where jsonb_typeof(item) <> 'object'
      or item ->> 'provider' is null
      or item ->> 'installation' is null
      or not item ? 'version'
      or item ->> 'authentication' is null
      or item ->> 'compatibility' is null
      or item ->> 'provider' not in ('codex', 'claude')
      or item ->> 'installation' not in (
        'not_installed', 'installing', 'installed',
        'update_required', 'failed'
      )
      or item ->> 'authentication' not in (
        'authenticated', 'signed_out', 'unknown'
      )
      or item ->> 'compatibility' not in (
        'supported', 'outdated', 'unavailable'
      )
      or (item ? 'models' and jsonb_typeof(item -> 'models') <> 'array')
      or (item ? 'defaultModel' and jsonb_typeof(item -> 'defaultModel') <> 'string')
  )
  or (
    select count(*) <> count(distinct item ->> 'provider')
    from jsonb_array_elements(target_statuses) as item
  )
  then
    raise exception 'invalid_provider_connections' using errcode = 'P0001';
  end if;

  insert into public.provider_connections (
    user_id,
    device_id,
    provider,
    installation,
    version,
    models,
    default_model,
    authentication,
    compatibility,
    last_seen_at
  )
  select
    target_user_id,
    target_device_id,
    (item ->> 'provider')::public.ai_provider,
    (item ->> 'installation')::public.provider_installation_status,
    item ->> 'version',
    coalesce(item -> 'models', '[]'::jsonb),
    item ->> 'defaultModel',
    (item ->> 'authentication')::public.provider_authentication_status,
    (item ->> 'compatibility')::public.provider_compatibility_status,
    now()
  from jsonb_array_elements(target_statuses) as item
  on conflict (device_id, provider) do update
  set provider = excluded.provider,
      installation = excluded.installation,
      version = excluded.version,
      models = excluded.models,
      default_model = excluded.default_model,
      authentication = excluded.authentication,
      compatibility = excluded.compatibility,
      last_seen_at = excluded.last_seen_at;
end;
$$;

-- Add model to the existing claim envelope. The model is nullable for tasks
-- created before this migration and is resolved to the adapter default.
create or replace function public.claim_ai_task(
  target_task_id uuid,
  target_device_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_task public.ai_tasks%rowtype;
  inserted_attempt public.ai_task_attempts%rowtype;
  next_attempt_no integer;
begin
  perform device.id
  from public.execution_devices as device
  where device.id = target_device_id
    and device.status = 'active'
    and device.revoked_at is null
  for update;

  if not found then
    raise exception 'inactive_execution_device' using errcode = 'P0001';
  end if;

  select task.* into claimed_task
  from public.ai_tasks as task
  where task.id = target_task_id
    and task.device_id = target_device_id
    and task.status = 'ready_to_run'
  for update skip locked;

  if claimed_task.id is null then
    raise exception 'ai_task_claim_rejected' using errcode = 'P0001';
  end if;

  select coalesce(
    (
      select attempt.attempt_no
      from public.ai_task_attempts as attempt
      where attempt.task_id = target_task_id
      order by attempt.attempt_no desc
      limit 1
    ),
    0
  ) + 1 into next_attempt_no;

  perform public.transition_ai_task(target_task_id, 'running', 'ready_to_run');

  insert into public.ai_task_attempts (
    id, task_id, device_id, attempt_no, lease_expires_at
  )
  values (
    gen_random_uuid(), target_task_id, target_device_id, next_attempt_no,
    now() + public.ai_task_lease_duration()
  )
  returning * into inserted_attempt;

  return jsonb_build_object(
    'taskId', claimed_task.id,
    'attemptId', inserted_attempt.id,
    'provider', claimed_task.provider,
    'model', claimed_task.model,
    'kind', claimed_task.kind,
    'instruction', claimed_task.instruction,
    'agentKind', claimed_task.agent_kind,
    'researchScope', claimed_task.research_scope
  );
end;
$$;

-- New callers pass the exact model selected by the web app. The legacy
-- two-argument function remains the compatibility path and leaves model null.
create function public.create_room_reply_task(
  target_source_message_id uuid,
  target_provider public.ai_provider,
  target_model text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  task public.ai_tasks%rowtype;
begin
  if target_model is not null
    and (length(btrim(target_model)) = 0 or length(target_model) > 100)
  then
    raise exception 'invalid_room_reply_request' using errcode = 'P0001';
  end if;

  result := public.create_room_reply_task(
    target_source_message_id,
    target_provider
  );

  select candidate.* into task
  from public.ai_tasks as candidate
  where candidate.id = (result ->> 'id')::uuid
  for update;

  if task.id is null then
    raise exception 'invalid_room_reply_request' using errcode = 'P0001';
  end if;

  if task.model is null and target_model is not null then
    update public.ai_tasks
    set model = btrim(target_model), updated_at = now()
    where id = task.id
    returning * into task;
  end if;

  return result || jsonb_build_object('model', task.model);
end;
$$;

revoke all on function public.create_room_reply_task(
  uuid, public.ai_provider, text
) from public;
revoke all on function public.create_room_reply_task(
  uuid, public.ai_provider, text
) from anon, authenticated, service_role;
grant execute on function public.create_room_reply_task(
  uuid, public.ai_provider, text
) to authenticated;

-- Preserve the research overload while threading the model through it.
create or replace function public.create_room_reply_task(
  target_source_message_id uuid,
  target_provider public.ai_provider,
  target_agent_kind public.ai_agent_kind,
  target_research_scope public.ai_research_scope,
  target_model text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  task public.ai_tasks%rowtype;
begin
  if target_agent_kind is null
    or target_research_scope is null
    or (target_agent_kind <> 'research' and target_research_scope <> 'room')
  then
    raise exception 'invalid_room_reply_request' using errcode = 'P0001';
  end if;

  result := public.create_room_reply_task(
    target_source_message_id,
    target_provider,
    target_model
  );

  select candidate.* into task
  from public.ai_tasks as candidate
  where candidate.id = (result ->> 'id')::uuid
  for update;

  if task.id is null then
    raise exception 'invalid_room_reply_request' using errcode = 'P0001';
  end if;

  if task.agent_kind <> target_agent_kind
    or task.research_scope <> target_research_scope
  then
    if task.status = 'queued'
      and task.agent_kind = 'product'
      and task.research_scope = 'room'
    then
      update public.ai_tasks
      set agent_kind = target_agent_kind,
          research_scope = target_research_scope,
          updated_at = now()
      where id = task.id
      returning * into task;
    else
      raise exception 'room_reply_agent_mismatch' using errcode = 'P0001';
    end if;
  end if;

  return result || jsonb_build_object(
    'agentKind', task.agent_kind,
    'researchScope', task.research_scope,
    'model', task.model,
    'updatedAt', task.updated_at
  );
end;
$$;

revoke all on function public.create_room_reply_task(
  uuid, public.ai_provider, public.ai_agent_kind, public.ai_research_scope, text
) from public;
revoke all on function public.create_room_reply_task(
  uuid, public.ai_provider, public.ai_agent_kind, public.ai_research_scope, text
) from anon, authenticated, service_role;
grant execute on function public.create_room_reply_task(
  uuid, public.ai_provider, public.ai_agent_kind, public.ai_research_scope, text
) to authenticated;
