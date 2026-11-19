-- Canvas screens carry their own source files (React or plain HTML) and keep
-- every change as a version. Legacy screens keep markup/styles/script.
-- Writes happen only through the security-definer functions below.

alter table public.design_screen_versions
  add column source_kind text not null default 'legacy',
  add column files jsonb,
  add column entry text,
  add column links text[] not null default '{}';

alter table public.design_screen_versions
  add constraint design_screen_version_source_kind
    check (source_kind in ('legacy', 'html', 'react')),
  add constraint design_screen_version_source_shape check (
    (source_kind = 'legacy' and files is null and entry is null)
    or (source_kind <> 'legacy' and jsonb_typeof(files) = 'object'
        and entry is not null and files ? entry)
  ),
  add constraint design_screen_version_files_size
    check (files is null or pg_column_size(files) <= 262144),
  add constraint design_screen_version_links_count
    check (cardinality(links) <= 100);

-- 1-20 string files, safe relative paths, entry among them.
create function public.canvas_screen_files_valid(candidate jsonb, candidate_entry text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select candidate is not null
    and jsonb_typeof(candidate) = 'object'
    and candidate_entry is not null
    and candidate ? candidate_entry
    and (select count(*) from jsonb_object_keys(candidate)) between 1 and 20
    and octet_length(candidate::text) <= 262144
    and not exists (
      select 1 from jsonb_each(candidate) as file(path, content)
      where jsonb_typeof(file.content) <> 'string'
         or file.path !~ '^[A-Za-z0-9_][A-Za-z0-9_./-]{0,119}$'
         or position('..' in file.path) > 0
    );
$$;
revoke all on function public.canvas_screen_files_valid(jsonb, text) from public, anon, authenticated, service_role;

create function public.create_canvas_screen(
  target_room_id uuid,
  screen_name text,
  new_kind text,
  new_files jsonb,
  new_entry text,
  new_form_factor text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  created public.design_screens;
  inserted public.design_screen_versions;
begin
  if not public.can_edit_room(target_room_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if new_kind is null or new_kind not in ('html', 'react')
    or new_form_factor is null or new_form_factor not in ('mobile', 'tablet', 'desktop')
    or not public.canvas_screen_files_valid(new_files, new_entry)
  then
    raise exception 'invalid_canvas_screen' using errcode = 'P0001';
  end if;

  created := public.create_design_screen(target_room_id, screen_name);

  insert into public.design_screen_versions (
    screen_id, room_id, markup, styles, script, actions_json,
    source_kind, files, entry, promoted, created_by
  ) values (
    created.id, created.room_id, '', '', null, '[]'::jsonb,
    new_kind, new_files, new_entry, true, auth.uid()
  )
  returning * into inserted;

  update public.design_screens
  set current_version_id = inserted.id,
      state = 'built',
      form_factor = new_form_factor,
      updated_at = now()
  where id = created.id;

  return jsonb_build_object('screenId', created.id, 'versionId', inserted.id);
end;
$$;
revoke all on function public.create_canvas_screen(uuid, text, text, jsonb, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_canvas_screen(uuid, text, text, jsonb, text, text)
  to authenticated;

create function public.save_canvas_screen_version(
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

  if screen.current_version_id is distinct from base_version then
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

-- Restoring never rewrites history: the chosen version is copied forward.
create function public.restore_screen_version(
  target_screen_id uuid,
  target_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  screen public.design_screens;
  source public.design_screen_versions;
  inserted public.design_screen_versions;
begin
  select * into screen
  from public.design_screens
  where id = target_screen_id and deleted_at is null
  for update;
  if screen.id is null or not public.can_edit_room(screen.room_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  select * into source
  from public.design_screen_versions
  where id = target_version_id and screen_id = target_screen_id;
  if source.id is null then
    raise exception 'version_not_found' using errcode = 'P0001';
  end if;

  insert into public.design_screen_versions (
    screen_id, room_id, markup, styles, script, actions_json,
    source_kind, files, entry, links, base_version_id, profile_version_id,
    promoted, created_by
  ) values (
    screen.id, screen.room_id, source.markup, source.styles, source.script, source.actions_json,
    source.source_kind, source.files, source.entry, source.links, screen.current_version_id,
    source.profile_version_id, true, auth.uid()
  )
  returning * into inserted;

  update public.design_screens
  set current_version_id = inserted.id, state = 'built', updated_at = now()
  where id = screen.id;

  return jsonb_build_object('status', 'saved', 'versionId', inserted.id);
end;
$$;
revoke all on function public.restore_screen_version(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.restore_screen_version(uuid, uuid) to authenticated;
