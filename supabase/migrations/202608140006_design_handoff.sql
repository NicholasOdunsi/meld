-- Assembles an immutable Design -> Development handoff snapshot: the built
-- screen manifest, the start screen, the active design-system profile
-- version, and the latest PRD revision (max version). design_handoff_snapshots,
-- its immutability trigger, and its participant-SELECT RLS policy already
-- exist (202608130009_design_references_handoffs.sql); INSERT is granted to
-- no role there, so this security-definer RPC is the only write path.
--
-- Split into an unchecked assembler plus a can_edit_room-gated public
-- wrapper. set_room_stage's Design -> Development branch calls the unchecked
-- assembler directly: set_room_stage authorizes callers who are the room
-- owner OR a workspace admin (public.is_room_participant AND (owner OR
-- is_workspace_admin)), which is broader than can_edit_room's
-- is_room_participant AND access = 'edit'. A non-owner workspace admin who
-- is only a 'view' participant would pass set_room_stage's gate but fail
-- can_edit_room, which would otherwise raise inside the perform and roll
-- back the entire stage move for a caller set_room_stage already authorized.
create function public.create_design_handoff_snapshot_unchecked(target_room_id uuid)
returns public.design_handoff_snapshots
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws_id uuid;
  snapshot public.design_handoff_snapshots;
begin
  select room.workspace_id into ws_id from public.rooms as room where room.id = target_room_id;

  insert into public.design_handoff_snapshots
    (room_id, workspace_id, manifest_json, start_screen_id, profile_version_id, prd_revision, created_by)
  values (
    target_room_id, ws_id,
    jsonb_build_object('screens', coalesce((
      select jsonb_agg(jsonb_build_object(
               'screenId', s.id, 'name', s.name, 'currentVersionId', s.current_version_id)
             order by s.canvas_x)
      from public.design_screens s
      where s.room_id = target_room_id and s.state = 'built' and s.deleted_at is null
    ), '[]'::jsonb)),
    (select s.id from public.design_screens s
       where s.room_id = target_room_id and s.state = 'built' and s.deleted_at is null
       order by s.canvas_x limit 1),
    (select p.active_version_id from public.design_system_profiles p where p.workspace_id = ws_id),
    (select max(prd.version) from public.prds prd where prd.room_id = target_room_id),
    auth.uid()
  )
  returning * into snapshot;
  return snapshot;
end;
$$;

-- Not client-callable: only invoked by other security-definer functions
-- (the public wrapper below, and set_room_stage) that have already
-- authorized the caller by their own gate.
revoke all on function public.create_design_handoff_snapshot_unchecked(uuid)
  from public, anon, authenticated;

create function public.create_design_handoff_snapshot(target_room_id uuid)
returns public.design_handoff_snapshots
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_edit_room(target_room_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  return public.create_design_handoff_snapshot_unchecked(target_room_id);
end;
$$;

revoke all on function public.create_design_handoff_snapshot(uuid) from public, anon;
grant execute on function public.create_design_handoff_snapshot(uuid) to authenticated;

-- CREATE OR REPLACE of the installed set_room_stage (202608110003_room_stage.sql),
-- adding one branch: a real Design -> Development move atomically writes a
-- handoff snapshot in the same transaction. current_room.stage is captured
-- `for update` before the write, so this only fires on a genuine transition;
-- the existing stage = target_stage early-return already prevents a no-op
-- re-move from reaching this branch. Everything else (auth, event insert,
-- security definer, search_path, grants) is unchanged.
create or replace function public.set_room_stage(
  target_room_id uuid,
  target_stage public.room_stage
)
returns public.room_stage
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_room public.rooms;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  select room.*
  into current_room
  from public.rooms as room
  where room.id = target_room_id
  for update;

  if current_room.id is null then
    raise exception 'Room not found' using errcode = 'P0001';
  end if;

  if not public.is_room_participant(current_room.id)
    or (
      current_room.owner_id <> current_user_id
      and not public.is_workspace_admin(current_room.workspace_id)
    )
  then
    raise exception 'Room stage access required' using errcode = 'P0001';
  end if;

  if current_room.stage = target_stage then
    return current_room.stage;
  end if;

  update public.rooms
  set stage = target_stage,
      updated_at = clock_timestamp()
  where id = current_room.id;

  insert into public.room_stage_events (
    room_id,
    from_stage,
    to_stage,
    changed_by,
    created_at
  )
  values (
    current_room.id,
    current_room.stage,
    target_stage,
    current_user_id,
    clock_timestamp()
  );

  if current_room.stage = 'design' and target_stage = 'development' then
    perform public.create_design_handoff_snapshot_unchecked(current_room.id);
  end if;

  return target_stage;
end;
$$;

revoke all on function public.set_room_stage(uuid, public.room_stage)
  from public;
grant execute on function public.set_room_stage(uuid, public.room_stage)
  to authenticated;
