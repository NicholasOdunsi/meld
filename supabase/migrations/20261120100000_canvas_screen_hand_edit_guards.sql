-- Manual edits must not promote a version while generation owns the screen.
-- Keep authorization, generation state and base comparison under the same row lock.
create or replace function public.save_canvas_screen_version(
  target_screen_id uuid,
  base_version uuid,
  new_files jsonb,
  new_links text[] default '{}',
  new_kind text default null,
  new_entry text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  screen public.design_screens;
  current_version public.design_screen_versions;
  next_kind text;
  next_entry text;
  inserted public.design_screen_versions;
begin
  select * into screen
  from public.design_screens
  where id = target_screen_id and deleted_at is null
  for update;
  if screen.id is null or not public.can_edit_room(screen.room_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  if screen.updating or screen.current_version_id is distinct from base_version then
    return jsonb_build_object('status', 'conflict', 'versionId', screen.current_version_id);
  end if;

  select * into current_version
  from public.design_screen_versions
  where id = screen.current_version_id;

  next_kind := coalesce(new_kind, nullif(current_version.source_kind, 'legacy'));
  next_entry := coalesce(new_entry, current_version.entry);
  if next_kind is null or next_kind not in ('html', 'react')
    or not public.canvas_screen_files_valid(new_files, next_entry)
    or cardinality(coalesce(new_links, '{}')) > 100
    or coalesce(array_ndims(new_links), 1) <> 1
    or exists (select 1 from unnest(new_links) as link(key)
               where key is null or key !~ '^[a-z][a-z0-9_-]{0,63}$')
  then
    raise exception 'invalid_canvas_screen' using errcode = 'P0001';
  end if;

  insert into public.design_screen_versions (
    screen_id, room_id, markup, styles, script, actions_json,
    source_kind, files, entry, links, base_version_id, promoted, created_by
  ) values (
    screen.id, screen.room_id, '', '', null, '[]'::jsonb,
    next_kind, new_files, next_entry, coalesce(new_links, '{}'), base_version, true, auth.uid()
  )
  returning * into inserted;

  update public.design_screens
  set current_version_id = inserted.id, state = 'built', updated_at = now()
  where id = screen.id;

  return jsonb_build_object('status', 'saved', 'versionId', inserted.id);
end;
$$;
revoke all on function public.save_canvas_screen_version(uuid, uuid, jsonb, text[], text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.save_canvas_screen_version(uuid, uuid, jsonb, text[], text, text)
  to authenticated;
