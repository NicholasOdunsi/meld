create type public.room_stage
  as enum ('discovery', 'define', 'design', 'development');

alter table public.rooms
  add column stage public.room_stage not null default 'discovery';

create table public.room_stage_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  from_stage public.room_stage not null,
  to_stage public.room_stage not null,
  changed_by uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),
  check (from_stage <> to_stage)
);

create index room_stage_events_room_created_at_idx
  on public.room_stage_events (room_id, created_at, id);

alter table public.room_stage_events enable row level security;

revoke all on table public.room_stage_events from anon, authenticated;
grant select on table public.room_stage_events to authenticated;

create policy "Participants can view room stage events"
on public.room_stage_events
for select
to authenticated
using (public.is_room_participant(room_id));

revoke update on table public.rooms from authenticated;
grant update(name) on table public.rooms to authenticated;

create function public.set_room_stage(
  target_room_id uuid,
  target_stage public.room_stage
)
returns public.room_stage
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_room public.rooms;
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
    raise exception 'Room stage access required' using errcode = 'P0001';
  end if;

  if current_room.stage = target_stage then
    return current_room.stage;
  end if;

  update public.rooms
  set stage = target_stage,
      updated_at = clock_timestamp()
  where id = current_room.id;

  insert into public.room_stage_events (
    room_id,
    from_stage,
    to_stage,
    changed_by,
    created_at
  )
  values (
    current_room.id,
    current_room.stage,
    target_stage,
    current_user_id,
    clock_timestamp()
  );

  return target_stage;
end;
$$;

revoke all on function public.set_room_stage(uuid, public.room_stage)
  from public;
grant execute on function public.set_room_stage(uuid, public.room_stage)
  to authenticated;

alter publication supabase_realtime
  add table public.rooms, public.room_stage_events;
