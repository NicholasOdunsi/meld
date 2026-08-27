-- Installed connectors released before user_flow_revise can only emit
-- user_flow_generate. Normalize their explicit update intent at the database
-- boundary so the button and canvas behavior stay correct before every device
-- has received the newer connector bundle.
create function public.user_flow_proposal_is_revision(
  reply_body text,
  source_instruction text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with candidate as (
    select lower(concat_ws(' ', reply_body, source_instruction)) as value
  )
  select coalesce(
    value ~ '\m(update|updating|upate|revise|revising|change|changing|modify|modifying|edit|editing|rename|renaming)\M.{0,100}\m(user[[:space:]]*flow|userflow|user[[:space:]]*journey|journey)\M'
    and value !~ '\m(update|updating|upate|revise|revising|change|changing|modify|modifying|edit|editing|rename|renaming)\M.{0,100}\m(new|another|separate)\M.{0,40}\m(user[[:space:]]*flow|userflow|user[[:space:]]*journey|journey)\M',
    false
  )
  from candidate;
$$;

create function public.normalize_user_flow_proposal_intent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_instruction text;
begin
  if new.author_type <> 'product_agent'
    or new.proposed_action ->> 'kind' <> 'user_flow_generate'
    or not exists (
      select 1 from public.user_flows as flow where flow.room_id = new.room_id
    )
  then
    return new;
  end if;

  select task.instruction
  into source_instruction
  from public.ai_tasks as task
  where task.id = new.ai_task_id
    and task.room_id = new.room_id
    and task.kind = 'room_reply';

  if public.user_flow_proposal_is_revision(new.body, source_instruction) then
    new.proposed_action := '{"kind":"user_flow_revise"}'::jsonb;
  end if;
  return new;
end;
$$;

create trigger messages_normalize_user_flow_proposal_intent
before insert or update of body, proposed_action on public.messages
for each row execute function public.normalize_user_flow_proposal_intent();

-- Correct legacy proposals already stored before this trigger existed. The
-- exact user-flow lifecycle row is the signal that there is something to
-- revise; explicit new/another/separate requests remain generation proposals.
update public.messages as message
set proposed_action = '{"kind":"user_flow_revise"}'::jsonb
from public.ai_tasks as task
where message.ai_task_id = task.id
  and message.room_id = task.room_id
  and message.author_type = 'product_agent'
  and message.proposed_action ->> 'kind' = 'user_flow_generate'
  and task.kind = 'room_reply'
  and exists (
    select 1 from public.user_flows as flow where flow.room_id = message.room_id
  )
  and public.user_flow_proposal_is_revision(message.body, task.instruction);

revoke all on function public.user_flow_proposal_is_revision(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.normalize_user_flow_proposal_intent()
  from public, anon, authenticated, service_role;
