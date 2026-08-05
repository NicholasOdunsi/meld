-- settle_ai_task writes a completing task in TWO updates: transition_ai_task
-- first flips status running -> completed (result_json still null), then a
-- second update sets result_json. The original materialize trigger keyed its
-- idempotency off `old.status = 'completed'`, so it fired on neither update:
--   * the status-only update failed the `result_json is null` guard, and
--   * the result_json update was skipped because old.status was already
--     'completed'.
-- The PRD therefore never materialized on the real settle path; only the
-- single-update test simulation worked. Key idempotency off source_task_id
-- instead, so the result_json update materializes exactly once regardless of
-- how many updates the settle path takes.
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

  -- Materialize at most once per task. source_task_id is the durable
  -- idempotency key across the two-update settle sequence and any later touch
  -- of the row; the removed `old.status` check could not survive a result that
  -- arrives after the status is already terminal.
  if exists (
    select 1 from public.prds as prd where prd.source_task_id = new.id
  ) then
    return new;
  end if;

  select room.owner_id into room_owner
  from public.discovery_rooms as room
  where room.id = new.room_id;

  -- Lock the room row so concurrent prd_generate completions in the same
  -- room serialize their version computation instead of racing to the same
  -- next_version and colliding on the (room_id, version) unique constraint.
  perform 1 from public.discovery_rooms where id = new.room_id for update;

  -- Re-check under the lock: a concurrent completion for this same task may
  -- have materialized while we waited.
  if exists (
    select 1 from public.prds as prd where prd.source_task_id = new.id
  ) then
    return new;
  end if;

  select coalesce(max(prd.version), 0) + 1 into next_version
  from public.prds as prd
  where prd.room_id = new.room_id;

  insert into public.prds (
    room_id, organization_id, version, status, document, owner_id, source_task_id)
  values (
    new.room_id, new.organization_id, next_version, 'draft', payload,
    room_owner, new.id);

  return new;
end;
$$;
