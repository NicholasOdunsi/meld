-- Values must equal DesignScreenEventKindSchema.options, in this order.
create type public.design_event_kind as enum (
  'message',
  'generation_started',
  'version_created',
  'version_promoted',
  'generation_failed',
  'restored',
  'stale_candidate'
);

create table public.design_screen_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  screen_id uuid references public.design_screens(id) on delete cascade,
  kind public.design_event_kind not null,
  message_id uuid,
  task_id uuid,
  version_id uuid references public.design_screen_versions(id) on delete set null,
  actor uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index design_screen_events_room
  on public.design_screen_events(room_id, created_at);
create index design_screen_events_screen
  on public.design_screen_events(screen_id, created_at);

alter table public.design_screen_events enable row level security;
revoke all on table public.design_screen_events from anon, authenticated;
grant select on table public.design_screen_events to authenticated;
create policy "Participants can view design events"
on public.design_screen_events for select to authenticated
using (public.is_room_participant(room_id));

create function public.append_design_screen_event(
  target_room_id uuid,
  target_screen_id uuid,
  event_kind public.design_event_kind,
  msg_id uuid default null,
  task_id uuid default null,
  ver_id uuid default null,
  actor_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted uuid;
begin
  insert into public.design_screen_events (
    room_id,
    screen_id,
    kind,
    message_id,
    task_id,
    version_id,
    actor
  ) values (
    target_room_id,
    target_screen_id,
    event_kind,
    msg_id,
    task_id,
    ver_id,
    actor_id
  )
  returning id into inserted;
  return inserted;
end;
$$;

revoke all on function public.append_design_screen_event(
  uuid,
  uuid,
  public.design_event_kind,
  uuid,
  uuid,
  uuid,
  uuid
) from public, anon, authenticated, service_role;
grant execute on function public.append_design_screen_event(
  uuid,
  uuid,
  public.design_event_kind,
  uuid,
  uuid,
  uuid,
  uuid
) to service_role;
