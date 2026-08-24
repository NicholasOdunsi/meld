create or replace function public.autosave_prd_document(
  target_room_id uuid,
  base_prd_id uuid,
  base_version integer,
  base_updated_at timestamptz,
  next_document jsonb
)
returns public.prds
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_room public.rooms%rowtype;
  current_prd public.prds%rowtype;
  saved_prd public.prds%rowtype;
begin
  if caller_id is null or not public.can_edit_room(target_room_id) then
    raise exception 'prd_edit_forbidden' using errcode = 'P0001';
  end if;

  select room.* into target_room
  from public.rooms as room
  where room.id = target_room_id
  for update;

  if target_room.id is null then
    raise exception 'prd_edit_forbidden' using errcode = 'P0001';
  end if;

  if next_document is null
    or jsonb_typeof(next_document) <> 'object'
    or next_document ->> 'format' is distinct from 'blocks-v1'
    or jsonb_typeof(next_document -> 'title') is distinct from 'string'
    or jsonb_typeof(next_document -> 'body') is distinct from 'object'
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

  if current_prd.id is null then
    if base_prd_id is not null
      or base_version <> 0
      or base_updated_at is not null
    then
      raise exception 'prd_revision_conflict' using errcode = 'P0001';
    end if;

    insert into public.prds (
      room_id, workspace_id, version, status, document, owner_id, created_by
    )
    values (
      target_room.id, target_room.workspace_id, 1, 'draft', next_document,
      target_room.owner_id, caller_id
    )
    returning * into saved_prd;
  elsif current_prd.id is distinct from base_prd_id
    or current_prd.version is distinct from base_version
    or current_prd.updated_at is distinct from base_updated_at
  then
    raise exception 'prd_revision_conflict' using errcode = 'P0001';
  elsif current_prd.status = 'draft' then
    update public.prds as prd
    set document = next_document,
        updated_at = clock_timestamp()
    where prd.id = current_prd.id
    returning * into saved_prd;
  else
    insert into public.prds (
      room_id, workspace_id, version, status, document, owner_id, created_by
    )
    values (
      target_room.id, target_room.workspace_id, current_prd.version + 1,
      'draft', next_document, target_room.owner_id, caller_id
    )
    returning * into saved_prd;
  end if;

  return saved_prd;
end;
$$;

revoke all on function public.autosave_prd_document(uuid, uuid, integer, timestamptz, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.autosave_prd_document(uuid, uuid, integer, timestamptz, jsonb)
  to authenticated;
