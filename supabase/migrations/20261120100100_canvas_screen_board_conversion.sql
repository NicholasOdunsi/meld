-- Idempotent first-edit conversion, serialized by original room and board source key.
create schema if not exists canvas_edit_private;
revoke all on schema canvas_edit_private from public, anon, authenticated, service_role;
create table canvas_edit_private.board_screen_conversions (
  room_id uuid not null references public.rooms(id) on delete cascade,
  board_screen_id text not null check (board_screen_id ~ '^[a-z][a-z0-9_-]{0,63}$'),
  screen_id uuid not null unique references public.design_screens(id) on delete cascade,
  primary key (room_id, board_screen_id)
);
alter table canvas_edit_private.board_screen_conversions enable row level security;
revoke all on canvas_edit_private.board_screen_conversions from public, anon, authenticated, service_role;

create function public.convert_canvas_board_screen(
  target_room_id uuid, board_screen_key text, screen_name text, new_files jsonb,
  new_entry text, new_form_factor text, new_links text[]
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  previous public.design_screens;
  created public.design_screens;
  inserted public.design_screen_versions;
begin
  if auth.uid() is null or not public.can_edit_room(target_room_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if screen_name is null or length(btrim(screen_name)) not between 1 and 120
    or board_screen_key is null or board_screen_key !~ '^[a-z][a-z0-9_-]{0,63}$' or new_entry is distinct from 'index.html'
    or new_files is null or not public.canvas_screen_files_valid(new_files,new_entry)
    or new_form_factor is null or new_form_factor not in ('mobile','tablet','desktop')
    or coalesce(cardinality(new_links),0) > 100 or coalesce(array_ndims(new_links),1) <> 1
    or exists (select 1 from unnest(new_links) x(key)
               where key is null or key !~ '^[a-z][a-z0-9_-]{0,63}$')
  then
    raise exception 'invalid_canvas_screen' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('canvas-board-conversion:' || target_room_id::text || ':' || board_screen_key,0));
  select s.* into previous
  from canvas_edit_private.board_screen_conversions m
  join public.design_screens s on s.id=m.screen_id and s.room_id=m.room_id
  where m.room_id=target_room_id and m.board_screen_id=board_screen_key
  for update of s;
  if found then
    if previous.deleted_at is not null then
      raise exception 'screen_deleted' using errcode = 'P0001';
    end if;
    return jsonb_build_object('existing',true,'screenId',previous.id,'versionId',previous.current_version_id);
  end if;
  -- Promoted versions are immutable; include extracted links in the initial
  -- insert instead of updating the result of create_canvas_screen afterward.
  created := public.create_design_screen(target_room_id, screen_name);
  insert into public.design_screen_versions (
    screen_id, room_id, markup, styles, script, actions_json,
    source_kind, files, entry, links, promoted, created_by
  ) values (
    created.id, created.room_id, '', '', null, '[]'::jsonb,
    'html', new_files, new_entry, coalesce(new_links,'{}'::text[]), true, auth.uid()
  ) returning * into inserted;
  update public.design_screens
    set current_version_id=inserted.id, state='built', form_factor=new_form_factor, updated_at=now()
    where id=created.id;
  insert into canvas_edit_private.board_screen_conversions(room_id,board_screen_id,screen_id)
    values(target_room_id,board_screen_key,created.id);
  return jsonb_build_object('screenId',created.id,'versionId',inserted.id,'existing',false);
end;
$$;
revoke all on function public.convert_canvas_board_screen(uuid,text,text,jsonb,text,text,text[])
  from public, anon, authenticated, service_role;
grant execute on function public.convert_canvas_board_screen(uuid,text,text,jsonb,text,text,text[])
  to authenticated;

create function public.read_canvas_board_conversion(target_room_id uuid,board_screen_key text)
returns uuid language plpgsql security definer stable set search_path='' as $$
declare matched uuid;
begin
  if auth.uid() is null or not public.can_edit_room(target_room_id) then
    raise exception 'not_authorized' using errcode='P0001';
  end if;
  select m.screen_id into matched from canvas_edit_private.board_screen_conversions m
    join public.design_screens s on s.id=m.screen_id and s.room_id=m.room_id
    where m.room_id=target_room_id and m.board_screen_id=board_screen_key and s.deleted_at is null;
  return matched;
end;
$$;
revoke all on function public.read_canvas_board_conversion(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.read_canvas_board_conversion(uuid,text) to authenticated;
