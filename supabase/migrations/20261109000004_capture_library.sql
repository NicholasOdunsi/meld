-- Native Inspiration screen (spec: docs/superpowers/specs/2026-11-09-native-inspiration-design.md).
-- The Mac app lists and edits the library with its Shelf token. These capture_*
-- RPCs mirror the session ones; both paths run the shared *_for helpers.

create function public.inspiration_update_note_for(actor uuid, scope_workspace uuid, target_item_id uuid, item_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if char_length(coalesce(item_note, '')) > 500 then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  update public.inspiration_items
  set note = nullif(btrim(coalesce(item_note, '')), ''), updated_at = now()
  where id = target_item_id
    and status = 'ready'
    and (scope_workspace is null or workspace_id = scope_workspace)
    and public.inspiration_actor_is_member(actor, workspace_id);
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end;
$$;

create function public.inspiration_delete_for(actor uuid, scope_workspace uuid, target_item_ids uuid[])
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  paths text[];
begin
  if coalesce(cardinality(target_item_ids), 0) not between 1 and 100 then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from unnest(target_item_ids) as wanted(id)
    left join public.inspiration_items item on item.id = wanted.id
    where item.id is null
      or (scope_workspace is not null and item.workspace_id <> scope_workspace)
      or not public.inspiration_actor_is_member(actor, item.workspace_id)
  ) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  with removed as (
    delete from public.inspiration_items
    where id = any(target_item_ids)
    returning storage_path
  )
  select coalesce(array_agg(storage_path), '{}') into paths from removed;
  return paths;
end;
$$;

revoke all on function public.inspiration_update_note_for(uuid, uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.inspiration_delete_for(uuid, uuid, uuid[]) from public, anon, authenticated, service_role;

-- Session RPCs keep their signatures and grants; they now share the helpers.
create or replace function public.update_inspiration_note(target_item_id uuid, item_note text)
returns void language sql security definer set search_path = ''
as $$ select public.inspiration_update_note_for(auth.uid(), null, target_item_id, item_note); $$;

create or replace function public.delete_inspiration_items(target_item_ids uuid[])
returns text[] language sql security definer set search_path = ''
as $$ select public.inspiration_delete_for(auth.uid(), null, target_item_ids); $$;

-- Capture RPCs (shelf routes; the route has already resolved the token).
create function public.capture_list_inspiration(
  actor_user_id uuid, target_workspace_id uuid, page_offset integer, page_limit integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.inspiration_actor_is_member(actor_user_id, target_workspace_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if page_offset is null or page_offset < 0 or page_limit is null or page_limit not between 1 and 200 then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  select coalesce(jsonb_agg(page.entry order by page.created_at desc, page.id), '[]'::jsonb)
  into result
  from (
    select
      item.id,
      item.created_at,
      jsonb_build_object(
        'id', item.id,
        'width', item.width,
        'height', item.height,
        'mime_type', item.mime_type,
        'note', item.note,
        'source_url', item.source_url,
        'created_at', item.created_at,
        'storage_path', item.storage_path,
        'label_status', label.status,
        'description', label.description,
        'rooms', coalesce((
          select jsonb_agg(
            jsonb_build_object('room_id', room.id, 'room_name', room.name, 'project_name', project.name)
            order by project.name, room.name)
          from public.room_inspiration link
          join public.rooms room on room.id = link.room_id
          join public.projects project on project.id = room.project_id
          where link.item_id = item.id
        ), '[]'::jsonb)
      ) as entry
    from public.inspiration_items item
    left join public.inspiration_labels label on label.item_id = item.id
    where item.workspace_id = target_workspace_id
      and item.status = 'ready'
    order by item.created_at desc, item.id
    offset page_offset
    limit page_limit
  ) page;
  return result;
end;
$$;

create function public.capture_update_inspiration_note(
  actor_user_id uuid, target_workspace_id uuid, target_item_id uuid, item_note text
)
returns void language sql security definer set search_path = ''
as $$ select public.inspiration_update_note_for(actor_user_id, target_workspace_id, target_item_id, item_note); $$;

create function public.capture_delete_inspiration_items(
  actor_user_id uuid, target_workspace_id uuid, target_item_ids uuid[]
)
returns text[] language sql security definer set search_path = ''
as $$ select public.inspiration_delete_for(actor_user_id, target_workspace_id, target_item_ids); $$;

create function public.capture_link_inspiration_items(
  actor_user_id uuid, target_workspace_id uuid, target_room_id uuid, target_item_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.rooms where id = target_room_id and workspace_id = target_workspace_id
  ) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  return public.inspiration_link_for(actor_user_id, target_room_id, target_item_ids);
end;
$$;

revoke all on function public.capture_list_inspiration(uuid, uuid, integer, integer) from public, anon, authenticated, service_role;
revoke all on function public.capture_update_inspiration_note(uuid, uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.capture_delete_inspiration_items(uuid, uuid, uuid[]) from public, anon, authenticated, service_role;
revoke all on function public.capture_link_inspiration_items(uuid, uuid, uuid, uuid[]) from public, anon, authenticated, service_role;

grant execute on function public.capture_list_inspiration(uuid, uuid, integer, integer) to service_role;
grant execute on function public.capture_update_inspiration_note(uuid, uuid, uuid, text) to service_role;
grant execute on function public.capture_delete_inspiration_items(uuid, uuid, uuid[]) to service_role;
grant execute on function public.capture_link_inspiration_items(uuid, uuid, uuid, uuid[]) to service_role;
