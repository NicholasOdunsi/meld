-- A revision materialises the next PRD version exactly like a generation:
-- the trigger now fires for prd_revise completions too. Everything else
-- (version = max+1, draft status, source_task_id) is unchanged.
CREATE OR REPLACE FUNCTION public.materialize_prd_from_task()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  payload jsonb;
  room_owner uuid;
  next_version integer;
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
$function$;
