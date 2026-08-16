create table public.design_references (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  normalized_url text not null,
  title text,
  thumbnail_ref text,
  oembed_status text not null default 'pending',
  fetched_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (room_id, normalized_url),
  constraint design_reference_url_len
    check (char_length(normalized_url) between 1 and 2048)
);

create index design_references_room
  on public.design_references(room_id, created_at);

alter table public.design_references enable row level security;
revoke all on table public.design_references from anon, authenticated;
grant select on table public.design_references to authenticated;
create policy "Participants can view references"
on public.design_references for select to authenticated
using (public.is_room_participant(room_id));

create function public.add_design_reference(
  target_room_id uuid,
  url text,
  ref_title text default null,
  thumb text default null,
  status text default 'pending'
)
returns public.design_references
language plpgsql
security definer
set search_path = ''
as $$
declare
  created public.design_references;
begin
  if not public.can_edit_room(target_room_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  insert into public.design_references (
    room_id,
    normalized_url,
    title,
    thumbnail_ref,
    oembed_status,
    fetched_at,
    created_by
  ) values (
    target_room_id,
    url,
    ref_title,
    thumb,
    status,
    case when status = 'ok' then now() else null end,
    auth.uid()
  )
  on conflict (room_id, normalized_url) do update
  set title = excluded.title,
      thumbnail_ref = excluded.thumbnail_ref,
      oembed_status = excluded.oembed_status,
      fetched_at = excluded.fetched_at
  returning * into created;
  return created;
end;
$$;

revoke all on function public.add_design_reference(
  uuid,
  text,
  text,
  text,
  text
) from public, anon, authenticated, service_role;
grant execute on function public.add_design_reference(
  uuid,
  text,
  text,
  text,
  text
) to authenticated;

create function public.delete_design_reference(target_reference_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ref_room uuid;
begin
  select reference.room_id into ref_room
  from public.design_references as reference
  where reference.id = target_reference_id;

  if ref_room is null or not public.can_edit_room(ref_room) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  delete from public.design_references
  where id = target_reference_id;
end;
$$;

revoke all on function public.delete_design_reference(uuid) from public, anon, authenticated, service_role;
grant execute on function public.delete_design_reference(uuid) to authenticated;

create table public.design_handoff_snapshots (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  manifest_json jsonb not null,
  start_screen_id uuid,
  profile_version_id uuid references public.design_system_profile_versions(id),
  prd_revision integer,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint design_handoff_manifest_size
    check (pg_column_size(manifest_json) <= 262144)
);

create index design_handoff_room
  on public.design_handoff_snapshots(room_id, created_at);

create function public.protect_design_handoff()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'design_handoff_immutable' using errcode = 'P0001';
  return null;
end;
$$;

revoke all on function public.protect_design_handoff() from public, anon, authenticated, service_role;
grant execute on function public.protect_design_handoff() to service_role;

create trigger design_handoff_immutable
before update or delete on public.design_handoff_snapshots
for each row execute function public.protect_design_handoff();

alter table public.design_handoff_snapshots enable row level security;
revoke all on table public.design_handoff_snapshots from anon, authenticated;
grant select on table public.design_handoff_snapshots to authenticated;
create policy "Participants can view handoffs"
on public.design_handoff_snapshots for select to authenticated
using (public.is_room_participant(room_id));
