-- The five-argument research overload shipped with a default for target_model
-- while the four-argument compatibility overload still existed. PostgreSQL
-- therefore could not resolve ordinary four-argument research calls.
drop function public.create_room_reply_task(
  uuid, public.ai_provider, public.ai_agent_kind, public.ai_research_scope, text
);

create function public.create_room_reply_task(
  target_source_message_id uuid,
  target_provider public.ai_provider,
  target_agent_kind public.ai_agent_kind,
  target_research_scope public.ai_research_scope,
  target_model text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  task public.ai_tasks%rowtype;
begin
  if target_agent_kind is null
    or target_research_scope is null
    or (target_agent_kind <> 'research' and target_research_scope <> 'room')
  then
    raise exception 'invalid_room_reply_request' using errcode = 'P0001';
  end if;

  result := public.create_room_reply_task(
    target_source_message_id,
    target_provider,
    target_model
  );

  select candidate.* into task
  from public.ai_tasks as candidate
  where candidate.id = (result ->> 'id')::uuid
  for update;

  if task.id is null then
    raise exception 'invalid_room_reply_request' using errcode = 'P0001';
  end if;

  if task.agent_kind <> target_agent_kind
    or task.research_scope <> target_research_scope
  then
    if task.status = 'queued'
      and task.agent_kind = 'product'
      and task.research_scope = 'room'
    then
      update public.ai_tasks
      set agent_kind = target_agent_kind,
          research_scope = target_research_scope,
          updated_at = now()
      where id = task.id
      returning * into task;
    else
      raise exception 'room_reply_agent_mismatch' using errcode = 'P0001';
    end if;
  end if;

  return result || jsonb_build_object(
    'agentKind', task.agent_kind,
    'researchScope', task.research_scope,
    'model', task.model,
    'updatedAt', task.updated_at
  );
end;
$$;

revoke all on function public.create_room_reply_task(
  uuid, public.ai_provider, public.ai_agent_kind, public.ai_research_scope, text
) from public, anon, authenticated, service_role;
grant execute on function public.create_room_reply_task(
  uuid, public.ai_provider, public.ai_agent_kind, public.ai_research_scope, text
) to authenticated;
