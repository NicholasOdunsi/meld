-- Distinguish a separate flow from a revision without introducing a second
-- connector task implementation. The completed generation tells the canvas
-- whether to append a frame or replace the current agent-generated frame.
create or replace function public.room_proposed_action_shape_ok(
  target_action jsonb
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    target_action in (
      '{"kind":"prd_generate"}'::jsonb,
      '{"kind":"prd_revise"}'::jsonb,
      '{"kind":"user_flow_generate"}'::jsonb,
      '{"kind":"user_flow_revise"}'::jsonb
    )
    or (
      target_action = jsonb_build_object(
        'kind', 'decision_capture',
        'summary', target_action -> 'summary',
        'sourceMessageId', target_action -> 'sourceMessageId'
      )
      and jsonb_typeof(target_action -> 'summary') = 'string'
      and char_length(
        regexp_replace(
          target_action ->> 'summary',
          '^[[:space:]]+|[[:space:]]+$',
          '',
          'g'
        )
      ) between 1 and 5000
      and (
        jsonb_typeof(target_action -> 'sourceMessageId') = 'null'
        or (
          jsonb_typeof(target_action -> 'sourceMessageId') = 'string'
          and (target_action ->> 'sourceMessageId') ~*
            '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        )
      )
    ),
    false
  );
$$;

alter table public.user_flow_generations
  add column application_mode text not null default 'append'
  check (application_mode in ('append', 'replace'));

create or replace function public.materialize_user_flow_generation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload jsonb;
  application_mode text := 'append';
begin
  if new.kind <> 'user_flow_generate'
    or new.status <> 'completed'
    or new.result_json is null
    or coalesce(new.result_json ->> 'partial', 'false') <> 'false'
  then
    return new;
  end if;
  payload := new.result_json -> 'payload';
  if jsonb_typeof(payload) <> 'object'
    or jsonb_typeof(payload -> 'title') <> 'string'
    or jsonb_typeof(payload -> 'nodes') <> 'array'
    or jsonb_typeof(payload -> 'edges') <> 'array'
  then
    return new;
  end if;

  select case
    when message.proposed_action ->> 'kind' = 'user_flow_revise'
      then 'replace'
    else 'append'
  end
  into application_mode
  from public.messages as message
  where message.id = new.source_message_id;

  insert into public.user_flow_generations(
    task_id, room_id, workspace_id, initiating_user_id, document,
    application_mode
  ) values (
    new.id, new.room_id, new.workspace_id, new.initiating_user_id, payload,
    coalesce(application_mode, 'append')
  ) on conflict (task_id) do nothing;
  return new;
end;
$$;

drop function public.get_user_flow_generation(uuid);
create function public.get_user_flow_generation(target_task_id uuid)
returns table(
  task_id uuid,
  room_id uuid,
  document jsonb,
  application_mode text,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select generation.task_id, generation.room_id, generation.document,
    generation.application_mode, generation.created_at
  from public.user_flow_generations as generation
  where generation.task_id = target_task_id
    and public.is_room_participant(generation.room_id);
$$;
revoke all on function public.get_user_flow_generation(uuid)
  from public, anon, service_role;
grant execute on function public.get_user_flow_generation(uuid)
  to authenticated;

drop function public.list_unapplied_user_flow_generations(uuid);
create function public.list_unapplied_user_flow_generations(
  target_room_id uuid
)
returns table(
  task_id uuid,
  room_id uuid,
  document jsonb,
  application_mode text,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select generation.task_id, generation.room_id, generation.document,
    generation.application_mode, generation.created_at
  from public.user_flow_generations as generation
  where generation.room_id = target_room_id
    and generation.initiating_user_id = auth.uid()
    and generation.applied_at is null
    and public.is_room_participant(generation.room_id)
  order by generation.created_at, generation.task_id;
$$;
revoke all on function public.list_unapplied_user_flow_generations(uuid)
  from public, anon, service_role;
grant execute on function public.list_unapplied_user_flow_generations(uuid)
  to authenticated;

-- Accepting a Product Agent user-flow proposal starts a second AI task. Keep
-- that continuation on the provider/model that produced the proposal and use
-- the original request as its instruction instead of a generic generation
-- prompt.
create or replace function public.accept_proposed_user_flow(
  target_message_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  proposal public.messages;
  lifecycle public.user_flows;
  source_task public.ai_tasks;
  generation_task jsonb;
  generation_task_id uuid;
  inherited_provider public.ai_provider;
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

  if proposal.proposed_action ->> 'kind' not in (
    'user_flow_generate', 'user_flow_revise'
  )
  then
    raise exception 'User flow proposal required' using errcode = 'P0001';
  end if;

  select task.*
  into source_task
  from public.ai_tasks as task
  where task.id = proposal.ai_task_id
    and task.room_id = proposal.room_id
    and task.kind = 'room_reply';

  if source_task.id is null then
    raise exception 'User flow proposal source required' using errcode = 'P0001';
  end if;

  lifecycle := public.start_user_flow(proposal.room_id);

  -- A participant accepting their own proposal continuation expects the model
  -- they selected. For a proposal created by another participant, retain the
  -- accepting participant's configured default because their device may not
  -- have the source provider installed.
  inherited_provider := case
    when source_task.initiating_user_id = caller_id then source_task.provider
    else null
  end;

  generation_task := public.create_user_flow_generate_task_internal(
    proposal.room_id,
    inherited_provider,
    source_task.instruction,
    proposal.id
  );
  generation_task_id := (generation_task ->> 'id')::uuid;

  if inherited_provider is not null and source_task.model is not null then
    update public.ai_tasks
    set model = source_task.model,
        updated_at = now()
    where id = generation_task_id
      and provider = source_task.provider
      and model is null;
  end if;

  select jsonb_build_object(
    'id', task.id,
    'roomId', task.room_id,
    'provider', task.provider,
    'model', task.model,
    'kind', task.kind,
    'status', task.status,
    'createdAt', task.created_at,
    'updatedAt', task.updated_at
  )
  into generation_task
  from public.ai_tasks as task
  where task.id = generation_task_id;

  insert into public.message_proposal_responses (
    message_id,
    user_id,
    response
  )
  values (target_message_id, caller_id, 'accepted')
  on conflict (message_id, user_id)
    do update set response = 'accepted';

  return jsonb_build_object(
    'user_flow', to_jsonb(lifecycle),
    'task', generation_task
  );
end;
$$;

revoke all on function public.accept_proposed_user_flow(uuid) from public;
grant execute on function public.accept_proposed_user_flow(uuid)
  to authenticated;
