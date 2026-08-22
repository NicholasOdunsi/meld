-- Deleting a flow-seeded screen didn't stick. seed_design_screens_from_flow
-- (202608140003_design_screen_flow_seed.sql) leaned entirely on the partial
-- unique index `design_screens_room_flow_node`, which covers live rows only
-- (`where deleted_at is null`). Once delete_design_screen soft-deleted a
-- screen, that node stopped conflicting -- so the next Canvas visit seeded it
-- straight back under a new id, and the frame the user had removed reappeared.
-- Observed locally as four rows per flow node: three deleted, one live.
--
-- A node that has ever had a screen in this room is now skipped outright,
-- deleted or not: removing a seeded screen is a decision, not a gap to refill.
-- The `on conflict` clause stays as the multiplayer race guard it always was
-- (the not-exists check reads a statement-start snapshot, so it can't see a
-- concurrent insert; the unique index still can).
create or replace function public.seed_design_screens_from_flow(
  target_room_id uuid,
  nodes jsonb
)
returns setof public.design_screens
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws_id uuid;
begin
  if not public.can_edit_room(target_room_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  select room.workspace_id into ws_id
    from public.rooms as room where room.id = target_room_id;
  if ws_id is null then
    raise exception 'room % not found', target_room_id using errcode = 'P0002';
  end if;

  return query
  insert into public.design_screens
    (room_id, workspace_id, name, flow_node_id, canvas_x, canvas_y, created_by)
  select
    target_room_id, ws_id,
    left(btrim(n.name), 120), n.node_id, n.x, n.y, auth.uid()
  from jsonb_to_recordset(nodes)
    as n(node_id text, name text, x double precision, y double precision)
  where n.node_id is not null and btrim(n.name) <> ''
    and not exists (
      select 1 from public.design_screens as prior
      where prior.room_id = target_room_id
        and prior.flow_node_id = n.node_id
    )
  on conflict (room_id, flow_node_id)
    where deleted_at is null and flow_node_id is not null
    do nothing
  returning *;
end;
$$;
