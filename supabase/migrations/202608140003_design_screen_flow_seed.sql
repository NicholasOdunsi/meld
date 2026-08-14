-- Flow seeding turns Define-flow `action` nodes into empty screen rows. A screen
-- is unique per (room, flow_node_id) among live rows so seeding is idempotent and
-- multiplayer-safe: two designers opening the Canvas at once cannot double-create
-- a node's screen. Composer-created screens have a null flow_node_id and are
-- excluded from the constraint (many un-flow-bound screens per room are fine).
create unique index design_screens_room_flow_node
  on public.design_screens (room_id, flow_node_id)
  where deleted_at is null and flow_node_id is not null;

-- Seed the screens implied by a flow's action nodes in one round-trip. RETURNING
-- on `on conflict do nothing` yields only the rows actually inserted, so the
-- caller learns exactly which new screens to project onto the canvas. Editor
-- authority and workspace resolution match create_design_screen. Runs
-- security definer (like create_design_screen) because design_screens has no
-- INSERT policy/grant for authenticated -- writes only ever happen through
-- these authority-checked RPCs.
create function public.seed_design_screens_from_flow(
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
  on conflict (room_id, flow_node_id)
    where deleted_at is null and flow_node_id is not null
    do nothing
  returning *;
end;
$$;

revoke all on function public.seed_design_screens_from_flow(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.seed_design_screens_from_flow(uuid, jsonb)
  to authenticated;
