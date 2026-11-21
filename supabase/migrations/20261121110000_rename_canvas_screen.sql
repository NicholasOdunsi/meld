-- Lets AI give a freshly pasted screen its real name a moment after it was
-- created as "New screen". The rename only happens while the screen still has
-- the placeholder name, so a name the owner typed in the meantime is never
-- overwritten.
create function public.rename_canvas_screen(
  target_screen_id uuid,
  expected_name text,
  new_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  screen public.design_screens;
  clean_name text := btrim(coalesce(new_name, ''));
begin
  select * into screen
  from public.design_screens
  where id = target_screen_id and deleted_at is null
  for update;
  if screen.id is null or not public.can_edit_room(screen.room_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if char_length(clean_name) not between 1 and 120 then
    raise exception 'invalid_screen_name' using errcode = 'P0001';
  end if;
  if screen.name is distinct from expected_name then
    return jsonb_build_object('status', 'unchanged');
  end if;

  update public.design_screens
  set name = clean_name, updated_at = now()
  where id = screen.id;
  return jsonb_build_object('status', 'renamed');
end;
$$;
revoke all on function public.rename_canvas_screen(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.rename_canvas_screen(uuid, text, text) to authenticated;
