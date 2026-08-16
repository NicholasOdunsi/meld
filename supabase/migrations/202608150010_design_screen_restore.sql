-- Undoes delete_design_screen (202608150009_design_screen_delete.sql): the
-- canvas's own tldraw undo stack (ctrl/cmd+Z) restores a just-deleted frame
-- shape locally on its own, so this RPC is what makes that stick past a
-- refresh -- clearing deleted_at the same way the delete set it. Editor-gated
-- and idempotent, mirroring delete_design_screen's own shape.

create function public.restore_design_screen(target_screen_id uuid)
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
  set deleted_at = null
  where id = target_screen_id
    and deleted_at is not null;
end;
$$;

revoke all on function public.restore_design_screen(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.restore_design_screen(uuid) to authenticated;
