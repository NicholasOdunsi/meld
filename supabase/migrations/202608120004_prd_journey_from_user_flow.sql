-- Slice 2 of the PRD-journey <-> User-Flows link: a generated PRD's
-- `userJourneys` section reflects the room's user flow instead of being an
-- independent second generation.
--
-- When a `prd_generate` task materializes and the room already has a generated
-- user flow, the PRD's `userJourneys` is overwritten with that flow's document
-- -- the exact same FlowDocument the User Flows canvas draws -- so the PRD
-- journey and the canvas agree. When the room has no flow, the model's own
-- generated journey is kept as-is.
--
-- This is `create or replace` over the function as it currently stands: the
-- body from 202608080004_prd_lazy_versioning.sql (generate + revise, advisory
-- lock, created_by, lazy draft versioning) AFTER the 202608110001 vocabulary
-- rename (public.rooms, workspace_id). The ONLY addition is the `room_flow`
-- lookup + `jsonb_set` override in the `prd_generate` branch; `prd_revise` is
-- unchanged.
create or replace function public.materialize_prd_from_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload jsonb;
  room_flow jsonb;
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
        room_id, workspace_id, version, status, document, owner_id,
        created_by, source_task_id
      )
      values (
        current_prd.room_id, current_prd.workspace_id, current_prd.version + 1,
        'draft', payload, current_prd.owner_id, current_prd.owner_id, new.id
      )
      returning * into saved_prd;
    end if;

    return new;
  end if;

  select room.owner_id into room_owner
  from public.rooms as room
  where room.id = new.room_id;

  if exists (
    select 1 from public.prds as prd where prd.source_task_id = new.id
  ) then
    return new;
  end if;

  -- Slice 2 override: the room's most recent generated user flow becomes the
  -- journey so the PRD and the User Flows canvas show the same graph. Kept
  -- deterministic here rather than asked of the model, and skipped when there
  -- is no flow (the model's own journey is used instead).
  select ufg.document into room_flow
  from public.user_flow_generations as ufg
  where ufg.room_id = new.room_id
  order by ufg.created_at desc
  limit 1;
  if room_flow is not null then
    payload := jsonb_set(payload, '{userJourneys}', room_flow, true);
  end if;

  insert into public.prds (
    room_id, workspace_id, version, status, document, owner_id, created_by,
    source_task_id
  )
  values (
    new.room_id, new.workspace_id,
    (select coalesce(max(prd.version), 0) + 1
     from public.prds as prd where prd.room_id = new.room_id),
    'draft', payload, room_owner, room_owner, new.id
  );

  return new;
end;
$$;
