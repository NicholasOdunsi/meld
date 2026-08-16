-- Screens on the canvas had no delete path: a user removing a screen's frame
-- from the tldraw canvas only ever touched the collaborative tldraw document,
-- never the `design_screens` row, which the canvas treats as authoritative --
-- so the frame was always recreated on the next reconcile (e.g. after a
-- refresh). This adds the missing soft-delete RPC, mirroring
-- `delete_design_reference` (202608130009_design_references_handoffs.sql):
-- editor-gated, idempotent, and consistent with the `deleted_at` column that
-- already existed on the table.

create function public.delete_design_screen(target_screen_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  screen_room uuid;
begin
  select screen.room_id into screen_room
  from public.design_screens as screen
  where screen.id = target_screen_id;

  if screen_room is null or not public.can_edit_room(screen_room) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  update public.design_screens
  set deleted_at = now()
  where id = target_screen_id
    and deleted_at is null;
end;
$$;

revoke all on function public.delete_design_screen(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.delete_design_screen(uuid) to authenticated;
