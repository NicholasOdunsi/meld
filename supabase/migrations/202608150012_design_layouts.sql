-- Shared layouts: reusable app-shell layouts that screens reference via
-- design_screens.layout_id. Table shape, size checks, immutability trigger,
-- and promotion RPC mirror design_screens / design_screen_versions
-- (202608130006, 202608130007). Layouts have no state/updating columns.

create table public.design_layouts (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  layout_key text not null check (layout_key ~ '^[a-z][a-z0-9_-]{0,63}$'),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  current_version_id uuid,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.design_layout_versions (
  id uuid primary key default gen_random_uuid(),
  layout_id uuid not null references public.design_layouts(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  shell_markup text not null,
  shell_styles text not null,
  actions_json jsonb not null,
  base_version_id uuid references public.design_layout_versions(id),
  profile_version_id uuid references public.design_system_profile_versions(id),
  originating_task_id uuid,
  promoted boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint design_layout_version_shell_markup_size
    check (pg_column_size(shell_markup) <= 98304),
  constraint design_layout_version_shell_styles_size
    check (pg_column_size(shell_styles) <= 32768),
  constraint design_layout_version_actions_size
    check (pg_column_size(actions_json) <= 16384)
);

alter table public.design_layouts
  add constraint design_layouts_current_version_fkey
  foreign key (current_version_id) references public.design_layout_versions(id);

create unique index design_layouts_room_key_unique
  on public.design_layouts (room_id, layout_key)
  where deleted_at is null;

create index design_layouts_room
  on public.design_layouts(room_id)
  where deleted_at is null;
create index design_layout_versions_layout
  on public.design_layout_versions(layout_id, created_at);

alter table public.design_screens
  add column layout_id uuid references public.design_layouts(id);

create function public.protect_design_layout_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'design_layout_version_immutable' using errcode = 'P0001';
  end if;
  if new.shell_markup is distinct from old.shell_markup
    or new.shell_styles is distinct from old.shell_styles
    or new.actions_json is distinct from old.actions_json
    or new.layout_id is distinct from old.layout_id
    or new.room_id is distinct from old.room_id
    or new.base_version_id is distinct from old.base_version_id
    or new.profile_version_id is distinct from old.profile_version_id
    or new.originating_task_id is distinct from old.originating_task_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
    or old.promoted
    or not new.promoted
  then
    raise exception 'design_layout_version_immutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_design_layout_version() from public, anon, authenticated, service_role;
grant execute on function public.protect_design_layout_version()
  to service_role;

create trigger design_layout_version_immutable
before update or delete on public.design_layout_versions
for each row execute function public.protect_design_layout_version();

alter table public.design_layouts enable row level security;
revoke all on table public.design_layouts from anon, authenticated;
grant select on table public.design_layouts to authenticated;
create policy "Participants can view layouts"
on public.design_layouts for select to authenticated
using (public.is_room_participant(room_id));

alter table public.design_layout_versions enable row level security;
revoke all on table public.design_layout_versions from anon, authenticated;
grant select on table public.design_layout_versions to authenticated;
create policy "Participants can view layout versions"
on public.design_layout_versions for select to authenticated
using (public.is_room_participant(room_id));

-- Insert an immutable layout version and attempt to promote it via
-- compare-and-swap. A lost CAS retains the new row as a stale candidate.
create function public.insert_and_promote_layout_version(
  target_layout_id uuid,
  new_shell_markup text,
  new_shell_styles text,
  new_actions jsonb,
  base_version uuid,
  profile_version uuid,
  task_id uuid,
  author uuid
)
returns public.design_layout_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  layout public.design_layouts;
  inserted public.design_layout_versions;
  promoted_count integer;
begin
  select * into layout
  from public.design_layouts
  where id = target_layout_id
  for update;

  if layout.id is null then
    raise exception 'design_layout_not_found' using errcode = 'P0001';
  end if;

  insert into public.design_layout_versions (
    layout_id,
    room_id,
    workspace_id,
    shell_markup,
    shell_styles,
    actions_json,
    base_version_id,
    profile_version_id,
    originating_task_id,
    created_by
  ) values (
    target_layout_id,
    layout.room_id,
    layout.workspace_id,
    new_shell_markup,
    new_shell_styles,
    new_actions,
    base_version,
    profile_version,
    task_id,
    author
  )
  returning * into inserted;

  update public.design_layouts
  set current_version_id = inserted.id,
      updated_at = now()
  where id = target_layout_id
    and current_version_id is not distinct from base_version;

  get diagnostics promoted_count = row_count;

  if promoted_count > 0 then
    update public.design_layout_versions
    set promoted = true
    where id = inserted.id;
    inserted.promoted := true;
  else
    update public.design_layouts
    set updated_at = now()
    where id = target_layout_id;
  end if;

  return inserted;
end;
$$;

revoke all on function public.insert_and_promote_layout_version(
  uuid,
  text,
  text,
  jsonb,
  uuid,
  uuid,
  uuid,
  uuid
) from public, anon, authenticated, service_role;
grant execute on function public.insert_and_promote_layout_version(
  uuid,
  text,
  text,
  jsonb,
  uuid,
  uuid,
  uuid,
  uuid
) to service_role;
