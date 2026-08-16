create or replace function public.protect_room_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.workspace_id <> old.workspace_id
    or new.owner_id <> old.owner_id
  then
    raise exception 'Room workspace and owner cannot be changed'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke update(project_id) on table public.rooms from authenticated;

create function public.move_room(
  target_room_id uuid,
  target_project_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_room public.rooms;
  moved_project_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  select room.*
  into current_room
  from public.rooms as room
  where room.id = target_room_id
  for update;

  if current_room.id is null then
    raise exception 'Room not found' using errcode = 'P0001';
  end if;

  if not public.is_room_participant(current_room.id)
    or (
      current_room.owner_id <> current_user_id
      and not public.is_workspace_admin(current_room.workspace_id)
    )
  then
    raise exception 'Room move access required' using errcode = 'P0001';
  end if;

  if current_room.project_id = target_project_id then
    return current_room.project_id;
  end if;

  perform 1
  from public.projects as project
  where project.id = target_project_id
    and project.workspace_id = current_room.workspace_id
  for key share;

  if not found then
    raise exception 'Target Project must belong to the Room workspace'
      using errcode = 'P0001';
  end if;

  update public.rooms
  set project_id = target_project_id,
      updated_at = clock_timestamp()
  where id = current_room.id
  returning project_id into moved_project_id;

  return moved_project_id;
end;
$$;

revoke all on function public.move_room(uuid, uuid) from public;
grant execute on function public.move_room(uuid, uuid) to authenticated;
