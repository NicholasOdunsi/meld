-- A generated PRD for a Discovery Room. One row per generated version; the
-- latest version is the current draft. Materialized by a trigger when a
-- prd_generate ai_task completes, so the browser never needs task result_json
-- (which RLS deliberately hides). Acceptance/immutability arrive in a later pass;
-- for now every row is status 'draft'.
create type public.prd_status as enum ('draft');

create table public.prds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  version integer not null check (version >= 1),
  status public.prd_status not null default 'draft',
  document jsonb not null,
  owner_id uuid not null references auth.users(id),
  source_task_id uuid references public.ai_tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, version),
  foreign key (room_id, organization_id)
    references public.discovery_rooms(id, organization_id) on delete cascade
);

alter table public.prds
  add constraint prds_document_size
    check (pg_column_size(document) <= 262144);

create index prds_room_version_idx on public.prds (room_id, version desc);

-- Materialize a PRD row when a prd_generate task completes. Runs as the table
-- owner (security definer semantics of a trigger), so it can write prds while
-- authenticated callers cannot. The document is the settled envelope payload.
create function public.materialize_prd_from_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload jsonb;
  room_owner uuid;
  next_version integer;
begin
  if new.kind <> 'prd_generate'
    or new.status <> 'completed'
    or new.result_json is null
    or old.status = 'completed'
  then
    return new;
  end if;

  payload := new.result_json -> 'payload';
  if jsonb_typeof(payload) <> 'object'
    or jsonb_typeof(payload -> 'title') <> 'string'
  then
    return new;
  end if;

  select room.owner_id into room_owner
  from public.discovery_rooms as room
  where room.id = new.room_id;

  select coalesce(max(prd.version), 0) + 1 into next_version
  from public.prds as prd
  where prd.room_id = new.room_id;

  insert into public.prds (
    room_id, organization_id, version, status, document, owner_id, source_task_id)
  values (
    new.room_id, new.organization_id, next_version, 'draft', payload,
    room_owner, new.id);

  return new;
end;
$$;

create trigger ai_tasks_materialize_prd
  after update on public.ai_tasks
  for each row
  execute function public.materialize_prd_from_task();

-- RLS: participants read; writes only via the trigger (definer). Mirrors the
-- ai_tasks grant model (select-only to authenticated).
alter table public.prds enable row level security;

revoke all on table public.prds from anon;
revoke all privileges on table public.prds from authenticated, service_role;
grant select on table public.prds to authenticated, service_role;

create policy "Room participants can view PRDs"
on public.prds
for select
to authenticated
using (public.is_room_participant(room_id));
