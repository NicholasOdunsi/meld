-- PRD proposal controls are per participant, just like Decision and user-flow
-- proposals. Queueing the task creates the artifact; this function durably
-- records that the caller accepted the proposal so a remount cannot offer it
-- again.
create function public.accept_prd_message_proposal(target_message_id uuid)
returns public.proposal_response
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  proposal public.messages;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  select message.*
  into proposal
  from public.messages as message
  where message.id = target_message_id
  for update;

  if proposal.id is null or proposal.proposed_action is null then
    raise exception 'Proposal not found' using errcode = 'P0001';
  end if;

  if not public.is_room_participant(proposal.room_id) then
    raise exception 'Room participation required' using errcode = 'P0001';
  end if;

  if proposal.proposed_action ->> 'kind' not in ('prd_generate', 'prd_revise')
  then
    raise exception 'PRD proposal required' using errcode = 'P0001';
  end if;

  insert into public.message_proposal_responses (
    message_id,
    user_id,
    response
  )
  values (target_message_id, caller_id, 'accepted')
  on conflict (message_id, user_id)
    do update set response = 'accepted';

  return 'accepted'::public.proposal_response;
end;
$$;

revoke all on function public.accept_prd_message_proposal(uuid) from public;
grant execute on function public.accept_prd_message_proposal(uuid)
  to authenticated;
