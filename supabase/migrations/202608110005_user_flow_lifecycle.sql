create table public.user_flows (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.user_flows enable row level security;

revoke all on table public.user_flows from anon, authenticated;
grant select on table public.user_flows to authenticated;

create policy "Participants can view user flow lifecycle metadata"
on public.user_flows
for select
to authenticated
using (public.is_room_participant(room_id));

create function public.start_user_flow(target_room_id uuid)
returns public.user_flows
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  lifecycle public.user_flows;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  if not public.can_edit_room(target_room_id) then
    raise exception 'User flow edit access required' using errcode = 'P0001';
  end if;

  insert into public.user_flows (room_id, created_by)
  values (target_room_id, caller_id)
  on conflict (room_id) do nothing;

  select flow.*
  into strict lifecycle
  from public.user_flows as flow
  where flow.room_id = target_room_id;

  return lifecycle;
end;
$$;

revoke all on function public.start_user_flow(uuid) from public;
grant execute on function public.start_user_flow(uuid) to authenticated;

alter publication supabase_realtime add table public.user_flows;
