-- Optional, editable metadata for task-backed Stars. The task and message
-- remain the source of truth for state, request and reply.
create table public.room_constellations (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, room_id),
  unique (room_id, name)
);

create index room_constellations_room_idx on public.room_constellations (room_id, created_at);

alter table public.ai_tasks add constraint ai_tasks_id_room_unique unique (id, room_id);

create table public.room_stars (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  task_id uuid not null unique,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  constellation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (task_id, room_id) references public.ai_tasks(id, room_id) on delete cascade,
  foreign key (constellation_id, room_id) references public.room_constellations(id, room_id)
);

create index room_stars_room_idx on public.room_stars (room_id, created_at desc);
create index room_stars_constellation_idx on public.room_stars (constellation_id) where constellation_id is not null;

alter table public.room_constellations enable row level security;
alter table public.room_stars enable row level security;
revoke all on public.room_constellations, public.room_stars from anon, authenticated;
grant select, insert, update on public.room_constellations, public.room_stars to authenticated;

create policy "Participants can view constellations"
on public.room_constellations for select to authenticated
using (public.is_room_participant(room_id));
create policy "Editors can create constellations"
on public.room_constellations for insert to authenticated
with check (public.can_edit_room(room_id));
create policy "Editors can rename constellations"
on public.room_constellations for update to authenticated
using (public.can_edit_room(room_id))
with check (public.can_edit_room(room_id));

create policy "Participants can view stars"
on public.room_stars for select to authenticated
using (public.is_room_participant(room_id));
create policy "Editors can create stars"
on public.room_stars for insert to authenticated
with check (public.can_edit_room(room_id));
create policy "Editors can update stars"
on public.room_stars for update to authenticated
using (public.can_edit_room(room_id))
with check (public.can_edit_room(room_id));
