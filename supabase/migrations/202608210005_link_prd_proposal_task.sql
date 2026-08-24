-- Bind a queued PRD task to the Product Agent proposal that started it. The
-- safe room-task projection can then show progress and completion beside the
-- proposal across navigation and reloads.
drop function public.accept_prd_message_proposal(uuid);

create function public.accept_prd_message_proposal(
  target_message_id uuid,
  target_task_id uuid
)
returns public.proposal_response
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  proposal public.messages;
  proposal_task public.ai_tasks;
  expected_kind text;
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

  expected_kind := proposal.proposed_action ->> 'kind';
  if expected_kind not in ('prd_generate', 'prd_revise') then
    raise exception 'PRD proposal required' using errcode = 'P0001';
  end if;

  select task.*
  into proposal_task
  from public.ai_tasks as task
  where task.id = target_task_id
    and task.room_id = proposal.room_id
    and task.initiating_user_id = caller_id
    and task.kind::text = expected_kind
  for update;

  if proposal_task.id is null then
    raise exception 'PRD proposal task required' using errcode = 'P0001';
  end if;

  if proposal_task.source_message_id is not null
    and proposal_task.source_message_id <> proposal.id
  then
    raise exception 'PRD proposal task already bound' using errcode = 'P0001';
  end if;

  update public.ai_tasks
  set source_message_id = proposal.id
  where id = proposal_task.id;

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

revoke all on function public.accept_prd_message_proposal(uuid, uuid)
  from public;
grant execute on function public.accept_prd_message_proposal(uuid, uuid)
  to authenticated;
