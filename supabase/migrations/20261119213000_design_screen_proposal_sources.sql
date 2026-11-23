-- Lets a room participant see which Orion reply started each built screen,
-- so the native app can show a screen inside the Star that asked for it.
-- The handoff table itself stays private; this returns only (screen, message).
create function public.list_design_screen_sources(target_room_id uuid)
returns table (screen_id uuid, message_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select handoff.screen_id, handoff.message_id
  from public.design_proposal_handoffs as handoff
  join public.design_screens as screen on screen.id = handoff.screen_id
  where screen.room_id = target_room_id
    and public.is_room_participant(target_room_id);
$$;

revoke all on function public.list_design_screen_sources(uuid) from public, anon, service_role;
grant execute on function public.list_design_screen_sources(uuid) to authenticated;
