-- PRD versions are append-only. Editors save a new draft against the version
-- they read, and only a room owner or organization admin may accept a draft.

alter type public.prd_status add value if not exists 'accepted';

alter table public.prds
  add column created_by uuid references auth.users(id),
  add column accepted_at timestamptz,
  add column accepted_by uuid references auth.users(id);

-- Existing rows were generated from their room owner's source material. Keep
-- that provenance while making the newly required creator field non-null.
update public.prds
set created_by = owner_id
where created_by is null;

alter table public.prds
  alter column created_by set not null;

-- Generated PRDs continue to use the room owner as their creator. Replacing
-- the latest trigger body preserves its two-step-settlement idempotency fix.
create or replace function public.materialize_prd_from_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload jsonb;
  room_owner uuid;
  next_version integer;
begin
  if new.kind <> 'prd_generate'
    or new.status <> 'completed'
    or new.result_json is null
  then
    return new;
  end if;

  payload := new.result_json -> 'payload';
  if payload is null
    or jsonb_typeof(payload) <> 'object'
    or jsonb_typeof(payload -> 'title') <> 'string'
  then
    return new;
  end if;

  if exists (
    select 1 from public.prds as prd where prd.source_task_id = new.id
  ) then
    return new;
  end if;

  select room.owner_id into room_owner
  from public.discovery_rooms as room
  where room.id = new.room_id;

  perform 1 from public.discovery_rooms where id = new.room_id for update;

  if exists (
    select 1 from public.prds as prd where prd.source_task_id = new.id
  ) then
    return new;
  end if;

  select coalesce(max(prd.version), 0) + 1 into next_version
  from public.prds as prd
  where prd.room_id = new.room_id;

  insert into public.prds (
    room_id, organization_id, version, status, document, owner_id, created_by,
    source_task_id
  )
  values (
    new.room_id, new.organization_id, next_version, 'draft', payload,
    room_owner, room_owner, new.id
  );

  return new;
end;
$$;

create function public.save_prd_version(
  target_room_id uuid,
  base_version integer,
  next_document jsonb
)
returns public.prds
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_room public.discovery_rooms%rowtype;
  current_version integer;
  saved_prd public.prds%rowtype;
begin
  if caller_id is null or not public.can_edit_room(target_room_id) then
    raise exception 'prd_edit_forbidden' using errcode = 'P0001';
  end if;

  select room.* into target_room
  from public.discovery_rooms as room
  where room.id = target_room_id
  for update;

  if target_room.id is null then
    raise exception 'prd_edit_forbidden' using errcode = 'P0001';
  end if;

  if next_document is null
    or jsonb_typeof(next_document) <> 'object'
    or jsonb_typeof(next_document -> 'title') <> 'string'
    or pg_catalog.pg_column_size(next_document) > 262144
  then
    raise exception 'invalid_prd_document' using errcode = 'P0001';
  end if;

  select coalesce(max(prd.version), 0) into current_version
  from public.prds as prd
  where prd.room_id = target_room_id;

  if base_version is distinct from current_version then
    raise exception 'prd_version_conflict' using errcode = 'P0001';
  end if;

  insert into public.prds (
    room_id, organization_id, version, status, document, owner_id, created_by
  )
  values (
    target_room.id, target_room.organization_id, current_version + 1, 'draft',
    next_document, target_room.owner_id, caller_id
  )
  returning * into saved_prd;

  return saved_prd;
end;
$$;

create function public.accept_prd_version(target_prd_id uuid)
returns public.prds
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_prd public.prds%rowtype;
  room_owner_id uuid;
  accepted_prd public.prds%rowtype;
begin
  if caller_id is null then
    raise exception 'prd_accept_forbidden' using errcode = 'P0001';
  end if;

  select prd.* into target_prd
  from public.prds as prd
  where prd.id = target_prd_id
  for update;

  if target_prd.id is null then
    raise exception 'prd_already_accepted' using errcode = 'P0001';
  end if;

  select room.owner_id into room_owner_id
  from public.discovery_rooms as room
  where room.id = target_prd.room_id
  for update;

  if caller_id <> room_owner_id
    and not public.is_org_admin(target_prd.organization_id)
  then
    raise exception 'prd_accept_forbidden' using errcode = 'P0001';
  end if;

  if target_prd.status = 'accepted' then
    return target_prd;
  end if;

  if target_prd.status <> 'draft' then
    raise exception 'prd_already_accepted' using errcode = 'P0001';
  end if;

  update public.prds as prd
  set status = 'accepted',
      accepted_at = now(),
      accepted_by = caller_id
  where prd.id = target_prd.id
  returning * into accepted_prd;

  return accepted_prd;
end;
$$;

create function public.protect_accepted_prd()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'accepted' then
      raise exception 'prd_accepted_immutable' using errcode = 'P0001';
    end if;
    return old;
  end if;

  if old.status = 'accepted' then
    raise exception 'prd_accepted_immutable' using errcode = 'P0001';
  end if;

  if new.status = 'accepted' then
    if old.status <> 'draft'
      or new.room_id is distinct from old.room_id
      or new.organization_id is distinct from old.organization_id
      or new.version is distinct from old.version
      or new.document is distinct from old.document
      or new.owner_id is distinct from old.owner_id
      or new.created_by is distinct from old.created_by
      or new.source_task_id is distinct from old.source_task_id
      or new.created_at is distinct from old.created_at
      or new.updated_at is distinct from old.updated_at
      or new.accepted_at is null
      or new.accepted_by is null
    then
      raise exception 'prd_accepted_immutable' using errcode = 'P0001';
    end if;
  elsif new.accepted_at is distinct from old.accepted_at
    or new.accepted_by is distinct from old.accepted_by
  then
    raise exception 'prd_accepted_immutable' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger protect_accepted_prd
before update or delete on public.prds
for each row
execute function public.protect_accepted_prd();

revoke all on table public.prds from anon, authenticated, service_role;
grant select on table public.prds to authenticated, service_role;

revoke all on function public.save_prd_version(uuid, integer, jsonb) from public;
revoke all on function public.save_prd_version(uuid, integer, jsonb)
  from anon, authenticated, service_role;
grant execute on function public.save_prd_version(uuid, integer, jsonb)
  to authenticated;

revoke all on function public.accept_prd_version(uuid) from public;
revoke all on function public.accept_prd_version(uuid)
  from anon, authenticated, service_role;
grant execute on function public.accept_prd_version(uuid) to authenticated;
