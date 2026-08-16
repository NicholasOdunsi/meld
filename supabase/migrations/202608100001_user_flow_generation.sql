-- User-flow generation is a normal queued AI task, but its completed payload is
-- copied into a narrow participant-readable table so browsers never read the
-- private ai_tasks result envelope. The task-kind enum value is committed by
-- 202608100000 before this migration uses it.

create table public.user_flow_generations (
  task_id uuid primary key references public.ai_tasks(id) on delete cascade,
  room_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  initiating_user_id uuid not null references auth.users(id),
  document jsonb not null,
  created_at timestamptz not null default now(),
  constraint user_flow_generations_document_size
    check (pg_column_size(document) <= 262144),
  foreign key (room_id, organization_id)
    references public.discovery_rooms(id, organization_id) on delete cascade
);

create index user_flow_generations_room_created_at_idx
  on public.user_flow_generations(room_id, created_at desc);

create unique index ai_tasks_one_active_user_flow_per_initiator
  on public.ai_tasks(room_id, initiating_user_id)
  where kind = 'user_flow_generate'
    and status in ('queued', 'waiting_for_device', 'ready_to_run', 'running');

create function public.create_user_flow_generate_task(
  target_room_id uuid,
  target_provider public.ai_provider default null,
  target_clarification text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_organization_id uuid;
  resolved_device_id uuid;
  resolved_provider public.ai_provider;
  frozen_manifest jsonb;
  result_task public.ai_tasks%rowtype;
  clarification text := nullif(btrim(coalesce(target_clarification, '')), '');
begin
  if caller_id is null then
    raise exception 'invalid_user_flow_generate_request' using errcode = 'P0001';
  end if;
  if clarification is not null and char_length(clarification) > 2000 then
    raise exception 'invalid_user_flow_generate_request' using errcode = 'P0001';
  end if;

  select room.organization_id into target_organization_id
  from public.discovery_rooms as room
  where room.id = target_room_id;

  if target_organization_id is null
    or not exists (
      select 1 from public.room_participants as participant
      where participant.room_id = target_room_id
        and participant.user_id = caller_id
        and (
          participant.access = 'edit'
          or exists (
            select 1 from public.discovery_rooms as owner_room
            where owner_room.id = target_room_id
              and owner_room.owner_id = caller_id
          )
          or public.is_org_admin(target_organization_id)
        )
    )
  then
    raise exception 'invalid_user_flow_generate_request' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_room_id::text || ':' || caller_id::text, 17)
  );

  select task.* into result_task
  from public.ai_tasks as task
  where task.room_id = target_room_id
    and task.initiating_user_id = caller_id
    and task.kind = 'user_flow_generate'
    and task.status in ('queued', 'waiting_for_device', 'ready_to_run', 'running')
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

  if resolved_device_id is null or resolved_provider is null
    or not exists (
      select 1 from public.execution_devices as device
      where device.id = resolved_device_id and device.user_id = caller_id
        and device.status = 'active' and device.revoked_at is null
    )
    or not exists (
      select 1 from public.provider_connections as connection
      where connection.device_id = resolved_device_id
        and connection.user_id = caller_id
        and connection.provider = resolved_provider
        and connection.installation = 'installed'
        and connection.authentication = 'authenticated'
        and connection.compatibility = 'supported'
    )
  then
    raise exception 'invalid_user_flow_generate_request' using errcode = 'P0001';
  end if;

  frozen_manifest := jsonb_build_object(
    'messageIds', (select coalesce(jsonb_agg(m.id order by m.created_at, m.id), '[]'::jsonb)
      from public.messages as m where m.room_id = target_room_id),
    'attachmentIds', (select coalesce(jsonb_agg(a.id order by a.created_at, a.id), '[]'::jsonb)
      from public.attachments as a where a.room_id = target_room_id
        and a.message_id is not null and a.discard_pending = false),
    'evidenceIds', (select coalesce(jsonb_agg(e.id order by e.created_at, e.id), '[]'::jsonb)
      from public.evidence as e where e.room_id = target_room_id),
    'decisionIds', (select coalesce(jsonb_agg(d.id order by d.created_at, d.id), '[]'::jsonb)
      from public.decisions as d where d.room_id = target_room_id)
  );

  insert into public.ai_tasks (
    initiating_user_id, organization_id, room_id, device_id, provider, kind,
    status, instruction, context_manifest_json, context_revision
  ) values (
    caller_id, target_organization_id, target_room_id, resolved_device_id,
    resolved_provider, 'user_flow_generate', 'queued',
    left(coalesce(clarification,
      'Generate one primary user flow from the authorized room context.'), 20000),
    frozen_manifest,
    0
  ) returning * into result_task;

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
    and task.kind = 'user_flow_generate'
    and task.status in ('queued', 'waiting_for_device', 'ready_to_run', 'running')
  order by task.created_at, task.id limit 1;
  if result_task.id is null then
    raise exception 'invalid_user_flow_generate_request' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'id', result_task.id, 'roomId', result_task.room_id,
    'provider', result_task.provider, 'kind', result_task.kind,
    'status', result_task.status, 'createdAt', result_task.created_at,
    'updatedAt', result_task.updated_at
  );
end;
$$;

revoke all on function public.create_user_flow_generate_task(uuid, public.ai_provider, text)
  from public, anon, service_role;
grant execute on function public.create_user_flow_generate_task(uuid, public.ai_provider, text)
  to authenticated;

create function public.materialize_user_flow_generation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload jsonb;
begin
  if new.kind <> 'user_flow_generate'
    or new.status <> 'completed'
    or new.result_json is null
    or coalesce(new.result_json ->> 'partial', 'false') <> 'false'
  then
    return new;
  end if;
  payload := new.result_json -> 'payload';
  if jsonb_typeof(payload) <> 'object'
    or jsonb_typeof(payload -> 'title') <> 'string'
    or jsonb_typeof(payload -> 'nodes') <> 'array'
    or jsonb_typeof(payload -> 'edges') <> 'array'
  then
    return new;
  end if;
  insert into public.user_flow_generations(
    task_id, room_id, organization_id, initiating_user_id, document
  ) values (
    new.id, new.room_id, new.organization_id, new.initiating_user_id, payload
  ) on conflict (task_id) do nothing;
  return new;
end;
$$;

create trigger ai_tasks_materialize_user_flow_generation
  after update on public.ai_tasks
  for each row execute function public.materialize_user_flow_generation();

alter table public.user_flow_generations enable row level security;
revoke all on table public.user_flow_generations from anon, authenticated;
grant select on table public.user_flow_generations to authenticated;
create policy "Room participants can view user flow generations"
on public.user_flow_generations for select to authenticated
using (public.is_room_participant(room_id));

create function public.get_user_flow_generation(target_task_id uuid)
returns table(task_id uuid, room_id uuid, document jsonb, created_at timestamptz)
language sql
security definer
set search_path = ''
as $$
  select generation.task_id, generation.room_id,
    generation.document, generation.created_at
  from public.user_flow_generations as generation
  where generation.task_id = target_task_id
    and public.is_room_participant(generation.room_id);
$$;

revoke all on function public.get_user_flow_generation(uuid)
  from public, anon, service_role;
grant execute on function public.get_user_flow_generation(uuid) to authenticated;
