create type public.design_screen_state as enum ('empty', 'built');

create table public.design_screens (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  flow_node_id text,
  state public.design_screen_state not null default 'empty',
  updating boolean not null default false,
  current_version_id uuid,
  canvas_x double precision not null default 0,
  canvas_y double precision not null default 0,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.design_screen_versions (
  id uuid primary key default gen_random_uuid(),
  screen_id uuid not null references public.design_screens(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  markup text not null,
  styles text not null,
  script text,
  actions_json jsonb not null,
  base_version_id uuid references public.design_screen_versions(id),
  profile_version_id uuid references public.design_system_profile_versions(id),
  originating_task_id uuid,
  promoted boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint design_screen_version_markup_size
    check (pg_column_size(markup) <= 98304),
  constraint design_screen_version_styles_size
    check (pg_column_size(styles) <= 32768),
  constraint design_screen_version_script_size
    check (script is null or pg_column_size(script) <= 32768),
  constraint design_screen_version_actions_size
    check (pg_column_size(actions_json) <= 16384)
);

alter table public.design_screens
  add constraint design_screens_current_version_fkey
  foreign key (current_version_id) references public.design_screen_versions(id);

create index design_screens_room
  on public.design_screens(room_id)
  where deleted_at is null;
create index design_screen_versions_screen
  on public.design_screen_versions(screen_id, created_at);

create function public.protect_design_screen_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'design_screen_version_immutable' using errcode = 'P0001';
  end if;
  if new.markup is distinct from old.markup
    or new.styles is distinct from old.styles
    or new.script is distinct from old.script
    or new.actions_json is distinct from old.actions_json
    or new.screen_id is distinct from old.screen_id
    or new.room_id is distinct from old.room_id
    or new.base_version_id is distinct from old.base_version_id
    or new.profile_version_id is distinct from old.profile_version_id
    or new.originating_task_id is distinct from old.originating_task_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
    or old.promoted
    or not new.promoted
  then
    raise exception 'design_screen_version_immutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_design_screen_version() from public, anon, authenticated, service_role;
grant execute on function public.protect_design_screen_version()
  to service_role;

create trigger design_screen_version_immutable
before update or delete on public.design_screen_versions
for each row execute function public.protect_design_screen_version();

alter table public.design_screens enable row level security;
revoke all on table public.design_screens from anon, authenticated;
grant select on table public.design_screens to authenticated;
create policy "Participants can view screens"
on public.design_screens for select to authenticated
using (public.is_room_participant(room_id));

alter table public.design_screen_versions enable row level security;
revoke all on table public.design_screen_versions from anon, authenticated;
grant select on table public.design_screen_versions to authenticated;
create policy "Participants can view screen versions"
on public.design_screen_versions for select to authenticated
using (public.is_room_participant(room_id));

create function public.create_design_screen(
  target_room_id uuid,
  screen_name text,
  node_id text default null,
  x double precision default 0,
  y double precision default 0
)
returns public.design_screens
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_workspace uuid;
  created public.design_screens;
begin
  if not public.can_edit_room(target_room_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  select room.workspace_id into target_workspace
  from public.rooms as room
  where room.id = target_room_id;

  insert into public.design_screens (
    room_id,
    workspace_id,
    name,
    flow_node_id,
    canvas_x,
    canvas_y,
    created_by
  ) values (
    target_room_id,
    target_workspace,
    screen_name,
    node_id,
    x,
    y,
    auth.uid()
  )
  returning * into created;
  return created;
end;
$$;

revoke all on function public.create_design_screen(
  uuid,
  text,
  text,
  double precision,
  double precision
) from public, anon, authenticated, service_role;
grant execute on function public.create_design_screen(
  uuid,
  text,
  text,
  double precision,
  double precision
) to authenticated;
