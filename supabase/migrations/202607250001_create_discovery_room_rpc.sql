create function public.create_discovery_room(
  target_organization_id uuid,
  room_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_room_name text := btrim(room_name);
  created_room public.discovery_rooms;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  if normalized_room_name is null
    or char_length(normalized_room_name) not between 1 and 120
  then
    raise exception 'A valid room name is required'
      using errcode = 'P0001';
  end if;

  if target_organization_id is null
    or not public.is_org_member(target_organization_id)
  then
    raise exception 'Organization membership required'
      using errcode = 'P0001';
  end if;

  insert into public.discovery_rooms (
    organization_id,
    name,
    owner_id
  )
  values (
    target_organization_id,
    normalized_room_name,
    current_user_id
  )
  returning * into created_room;

  return jsonb_build_object(
    'id', created_room.id,
    'organization_id', created_room.organization_id,
    'name', created_room.name,
    'owner_id', created_room.owner_id,
    'created_at', created_room.created_at
  );
end;
$$;

revoke all
  on function public.create_discovery_room(uuid, text)
  from public;

grant execute
  on function public.create_discovery_room(uuid, text)
  to authenticated;
