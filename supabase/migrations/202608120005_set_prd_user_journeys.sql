-- Slice B of the PRD-journey <-> User-Flows link: canvas edits flow back into
-- the PRD's user-journey section.
--
-- The web app extracts a FlowDocument from the canvas when the user leaves it
-- and calls this RPC. It writes that flow into the room's current PRD
-- `userJourneys`, lazy-versioned the same way a section revise is: a draft is
-- updated in place, an accepted version spawns a new draft. It no-ops when the
-- room has no PRD or when the journey is already in sync, so leaving the canvas
-- without changing the flow costs nothing.
--
-- Edit access is required (same gate as start_user_flow). The advisory lock key
-- matches materialize_prd_from_task so a canvas sync and a PRD generation for
-- the same room serialize instead of racing on the latest version.
create function public.set_prd_user_journeys(
  target_room_id uuid,
  target_flow jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  current_prd public.prds%rowtype;
  next_document jsonb;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = 'P0001';
  end if;

  if not public.can_edit_room(target_room_id) then
    raise exception 'user_flow_edit_access_required' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_room_id::text, 1)
  );

  select prd.* into current_prd
  from public.prds as prd
  where prd.room_id = target_room_id
  order by prd.version desc, prd.id desc
  limit 1
  for update;

  -- No PRD yet: there is no journey section to sync the canvas into.
  if current_prd.id is null then
    return;
  end if;

  -- Already in sync: skip the write (and any version bump).
  if current_prd.document -> 'userJourneys' = target_flow then
    return;
  end if;

  next_document := jsonb_set(
    current_prd.document, '{userJourneys}', target_flow, true);

  if current_prd.status = 'draft' then
    update public.prds as prd
    set document = next_document,
        updated_at = now()
    where prd.id = current_prd.id;
  else
    insert into public.prds (
      room_id, workspace_id, version, status, document, owner_id,
      created_by, source_task_id
    )
    values (
      current_prd.room_id, current_prd.workspace_id, current_prd.version + 1,
      'draft', next_document, current_prd.owner_id, caller_id, null
    );
  end if;
end;
$$;

revoke all on function public.set_prd_user_journeys(uuid, jsonb) from public;
revoke all on function public.set_prd_user_journeys(uuid, jsonb) from anon;
grant execute on function public.set_prd_user_journeys(uuid, jsonb) to authenticated;
