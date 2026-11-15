-- A proposal and its design task commit together. Locking the source message
-- serializes simultaneous native windows; a retry returns the same task.
create table public.design_proposal_handoffs (
  message_id uuid primary key references public.messages(id) on delete restrict,
  screen_id uuid not null references public.design_screens(id) on delete restrict,
  task_id uuid not null unique references public.ai_tasks(id) on delete restrict,
  created_at timestamptz not null default now()
);
alter table public.design_proposal_handoffs enable row level security;
revoke all on table public.design_proposal_handoffs from public, anon, authenticated;

create function public.start_design_proposal(
  target_message_id uuid,
  target_instruction text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  proposal public.messages;
  existing public.design_proposal_handoffs;
  created public.design_screens;
  task jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;
  select * into proposal from public.messages
  where id = target_message_id for update;
  if proposal.id is null
    or proposal.proposed_action ->> 'kind' <> 'design_screen'
    or not public.can_edit_room(proposal.room_id)
  then
    raise exception 'Invalid design proposal' using errcode = 'P0001';
  end if;

  select * into existing from public.design_proposal_handoffs
  where message_id = target_message_id;
  if existing.message_id is not null then
    return jsonb_build_object('taskId', existing.task_id, 'screenId', existing.screen_id);
  end if;

  if target_instruction is null or length(btrim(target_instruction)) = 0
    or length(target_instruction) > 20000 then
    raise exception 'Invalid design instruction' using errcode = 'P0001';
  end if;
  created := public.create_design_screen(
    proposal.room_id,
    coalesce(nullif(proposal.proposed_action ->> 'name', ''), 'Screen')
  );
  task := public.create_design_screen_generate_task(created.id, null, target_instruction);
  insert into public.design_proposal_handoffs(message_id, screen_id, task_id)
  values(target_message_id, created.id, (task ->> 'id')::uuid);
  perform public.set_design_generation_user_prompt(
    (task ->> 'id')::uuid, proposal.proposed_action ->> 'instruction'
  );
  return jsonb_build_object('taskId', task ->> 'id', 'screenId', created.id);
end;
$$;
revoke all on function public.start_design_proposal(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.start_design_proposal(uuid, text)
  to authenticated;
