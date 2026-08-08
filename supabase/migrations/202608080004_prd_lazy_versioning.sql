-- Keep one live draft per room between acceptance points. A save or an AI
-- proposal application updates that draft in place. Once an accepted PRD is
-- edited, preserve it and create the next draft version lazily.

create or replace function public.materialize_prd_from_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload jsonb;
  room_owner uuid;
  current_prd public.prds%rowtype;
  saved_prd public.prds%rowtype;
begin
  if new.kind not in ('prd_generate', 'prd_revise')
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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.room_id::text, 1)
  );

  if new.kind = 'prd_revise' then
    select prd.* into current_prd
    from public.prds as prd
    where prd.room_id = new.room_id
    order by prd.version desc, prd.id desc
    limit 1
    for update;

    if current_prd.id is null then
      return new;
    end if;

    if current_prd.status = 'draft' then
      update public.prds as prd
      set document = payload,
          updated_at = now()
      where prd.id = current_prd.id
      returning * into saved_prd;
    else
      insert into public.prds (
        room_id, organization_id, version, status, document, owner_id,
        created_by, source_task_id
      )
      values (
        current_prd.room_id, current_prd.organization_id, current_prd.version + 1,
        'draft', payload, current_prd.owner_id, current_prd.owner_id, new.id
      )
      returning * into saved_prd;
    end if;

    return new;
  end if;

  select room.owner_id into room_owner
  from public.discovery_rooms as room
  where room.id = new.room_id;

  if exists (
    select 1 from public.prds as prd where prd.source_task_id = new.id
  ) then
    return new;
  end if;

  insert into public.prds (
    room_id, organization_id, version, status, document, owner_id, created_by,
    source_task_id
  )
  values (
    new.room_id, new.organization_id,
    (select coalesce(max(prd.version), 0) + 1
     from public.prds as prd where prd.room_id = new.room_id),
    'draft', payload, room_owner, room_owner, new.id
  );

  return new;
end;
$$;

create or replace function public.save_prd_version(
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
  current_prd public.prds%rowtype;
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
    or jsonb_typeof(next_document -> 'title') is distinct from 'string'
    or pg_catalog.pg_column_size(next_document) > 262144
  then
    raise exception 'invalid_prd_document' using errcode = 'P0001';
  end if;

  select prd.* into current_prd
  from public.prds as prd
  where prd.room_id = target_room_id
  order by prd.version desc, prd.id desc
  limit 1
  for update;

  if current_prd.id is null or base_version is distinct from current_prd.version then
    raise exception 'prd_version_conflict' using errcode = 'P0001';
  end if;

  if current_prd.status = 'draft' then
    update public.prds as prd
    set document = next_document,
        updated_at = now()
    where prd.id = current_prd.id
    returning * into saved_prd;
  else
    insert into public.prds (
      room_id, organization_id, version, status, document, owner_id, created_by
    )
    values (
      target_room.id, target_room.organization_id, current_prd.version + 1,
      'draft', next_document, target_room.owner_id, caller_id
    )
    returning * into saved_prd;
  end if;

  return saved_prd;
end;
$$;

create or replace function public.apply_prd_proposal(target_proposal_id uuid)
returns public.prds
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  proposal public.prd_proposals%rowtype;
  current_prd public.prds%rowtype;
  saved_prd public.prds%rowtype;
  next_document jsonb;
begin
  select p.* into proposal
  from public.prd_proposals as p
  where p.id = target_proposal_id
  for update;

  if proposal.id is null or caller_id is null
    or not public.can_edit_room(proposal.room_id)
    or proposal.status <> 'ready'
    or proposal.proposed_value is null
  then
    raise exception 'prd_proposal_not_ready' using errcode = 'P0001';
  end if;

  select p.* into current_prd
  from public.prds as p
  where p.room_id = proposal.room_id
  order by p.version desc, p.id desc
  limit 1
  for update;

  if current_prd.version is distinct from proposal.base_version then
    raise exception 'prd_proposal_conflict' using errcode = 'P0001';
  end if;

  next_document := jsonb_set(
    current_prd.document,
    array[proposal.section_field],
    proposal.proposed_value,
    false
  );

  if current_prd.status = 'draft' then
    update public.prds as p
    set document = next_document,
        updated_at = now()
    where p.id = current_prd.id
    returning * into saved_prd;
  else
    insert into public.prds (
      room_id, organization_id, version, status, document, owner_id, created_by
    )
    values (
      current_prd.room_id, current_prd.organization_id, current_prd.version + 1,
      'draft', next_document, current_prd.owner_id, caller_id
    )
    returning * into saved_prd;
  end if;

  update public.prd_proposals
  set status = 'applied', applied_at = now(), updated_at = now()
  where id = proposal.id;

  update public.prd_proposals
  set status = 'discarded', discarded_at = coalesce(discarded_at, now()),
      updated_at = now()
  where room_id = proposal.room_id
    and section_field = proposal.section_field
    and status = 'failed'
    and created_at <= proposal.created_at
    and id <> proposal.id;

  return saved_prd;
end;
$$;

revoke all on function public.save_prd_version(uuid, integer, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_prd_version(uuid, integer, jsonb) to authenticated;
revoke all on function public.apply_prd_proposal(uuid) from public, anon, authenticated, service_role;
grant execute on function public.apply_prd_proposal(uuid) to authenticated;
