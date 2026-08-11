-- A proposal is answered per person, and the artifact it proposes is created
-- once for the Room. Those are two different lifetimes, so responses live in
-- their own per-user table while the durable artifact (a Decision, a user flow)
-- is keyed by the proposal message and created at most once no matter how many
-- participants confirm it.

create type public.proposal_response as enum ('accepted', 'dismissed');

create table public.message_proposal_responses (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  response public.proposal_response not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.message_proposal_responses enable row level security;

revoke all on table public.message_proposal_responses
  from anon, authenticated;
grant select on table public.message_proposal_responses to authenticated;

-- Own rows only, and only while the reader still participates in the Room:
-- one participant dismissing a proposal must never hide it from anyone else,
-- and losing Room access must take the responses with it.
create policy "Participants can view their own proposal responses"
on public.message_proposal_responses
for select
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.messages as message
    where message.id = message_proposal_responses.message_id
      and public.is_room_participant(message.room_id)
  )
);

-- The uniqueness that makes capture idempotent: one Decision per proposal,
-- whoever confirms it and however many times they click. `on delete restrict`
-- matches the existing source-message rule -- a Decision outlives nothing.
alter table public.decisions
  add column proposal_message_id uuid unique
  references public.messages(id) on delete restrict;

-- The same Room binding the source message already carries. Participants may
-- still insert their own Decisions directly, so without it someone could claim
-- another Room's proposal by id and take the unique key its participants need.
alter table public.decisions
  add constraint decisions_proposal_message_id_room_id_fkey
  foreign key (proposal_message_id, room_id)
  references public.messages(id, room_id) on delete restrict;

-- The same idempotency for generation: one user-flow task per proposal,
-- terminal or not, so a retry resurfaces the original run.
create unique index ai_tasks_one_user_flow_generate_per_source
  on public.ai_tasks (source_message_id, kind)
  where source_message_id is not null
    and kind = 'user_flow_generate';

create function public.dismiss_message_proposal(target_message_id uuid)
returns public.proposal_response
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  proposal public.messages;
  recorded public.proposal_response;
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

  -- Dismissal never overwrites an acceptance: the artifact it created is
  -- already durable, so hiding the control cannot un-say the answer.
  insert into public.message_proposal_responses (
    message_id,
    user_id,
    response
  )
  values (target_message_id, caller_id, 'dismissed')
  on conflict (message_id, user_id) do nothing;

  select existing.response
  into recorded
  from public.message_proposal_responses as existing
  where existing.message_id = target_message_id
    and existing.user_id = caller_id;

  return recorded;
end;
$$;

revoke all on function public.dismiss_message_proposal(uuid) from public;
grant execute on function public.dismiss_message_proposal(uuid)
  to authenticated;

create function public.capture_proposed_decision(target_message_id uuid)
returns public.decisions
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  proposal public.messages;
  captured public.decisions;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  -- Locking the proposal serializes two participants confirming at once, so
  -- the second one reads the Decision the first one wrote.
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

  if proposal.proposed_action ->> 'kind' is distinct from 'decision_capture'
  then
    raise exception 'Decision proposal required' using errcode = 'P0001';
  end if;

  -- Trimmed with the same whitespace class the shape check and settlement use,
  -- so the stored Decision is exactly the summary the contract described.
  insert into public.decisions (
    room_id,
    source_message_id,
    summary,
    created_by,
    proposal_message_id
  )
  values (
    proposal.room_id,
    (proposal.proposed_action ->> 'sourceMessageId')::uuid,
    regexp_replace(
      proposal.proposed_action ->> 'summary',
      '^[[:space:]]+|[[:space:]]+$',
      '',
      'g'
    ),
    caller_id,
    proposal.id
  )
  on conflict (proposal_message_id) do nothing;

  select decision.*
  into strict captured
  from public.decisions as decision
  where decision.proposal_message_id = proposal.id;

  insert into public.message_proposal_responses (
    message_id,
    user_id,
    response
  )
  values (target_message_id, caller_id, 'accepted')
  on conflict (message_id, user_id)
    do update set response = 'accepted';

  return captured;
end;
$$;

revoke all on function public.capture_proposed_decision(uuid) from public;
grant execute on function public.capture_proposed_decision(uuid)
  to authenticated;

-- The installed user-flow task creator, moved behind a private four-argument
-- helper so an accepted proposal can bind the task to the message that
-- proposed it. Everything else -- authorization, the per-initiator advisory
-- lock, provider resolution, the frozen manifest, and the returned JSON --
-- is unchanged, and the public three-argument creator keeps its signature.
create function public.create_user_flow_generate_task_internal(
  target_room_id uuid,
  target_provider public.ai_provider,
  target_clarification text,
  target_source_message_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_workspace_id uuid;
  resolved_device_id uuid;
  resolved_provider public.ai_provider;
  frozen_manifest jsonb;
  result_task public.ai_tasks%rowtype;
  clarification text := nullif(btrim(coalesce(target_clarification, '')), '');
begin
  if caller_id is null then
    raise exception 'invalid_user_flow_generate_request' using errcode = 'P0001';
  end if;
  if clarification is not null and char_length(clarification) > 2000 then
    raise exception 'invalid_user_flow_generate_request' using errcode = 'P0001';
  end if;

  select room.workspace_id into target_workspace_id
  from public.rooms as room
  where room.id = target_room_id;

  if target_workspace_id is null
    or not exists (
      select 1 from public.room_participants as participant
      where participant.room_id = target_room_id
        and participant.user_id = caller_id
        and (
          participant.access = 'edit'
          or exists (
            select 1 from public.rooms as owner_room
            where owner_room.id = target_room_id
              and owner_room.owner_id = caller_id
          )
          or public.is_workspace_admin(target_workspace_id)
        )
    )
  then
    raise exception 'invalid_user_flow_generate_request' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_room_id::text || ':' || caller_id::text, 17)
  );

  -- A proposal-sourced task is looked up by its source in any status, not just
  -- an active one: confirming the same proposal again must resurface the run it
  -- already started rather than queue a second one.
  if target_source_message_id is not null then
    select task.* into result_task
    from public.ai_tasks as task
    where task.source_message_id = target_source_message_id
      and task.kind = 'user_flow_generate';

    if result_task.id is not null then
      return jsonb_build_object(
        'id', result_task.id,
        'roomId', result_task.room_id,
        'provider', result_task.provider,
        'kind', result_task.kind,
        'status', result_task.status,
        'createdAt', result_task.created_at,
        'updatedAt', result_task.updated_at
      );
    end if;
  end if;

  select task.* into result_task
  from public.ai_tasks as task
  where task.room_id = target_room_id
    and task.initiating_user_id = caller_id
    and task.kind = 'user_flow_generate'
    and task.status in ('queued', 'waiting_for_device', 'ready_to_run', 'running')
  order by task.created_at, task.id
  limit 1;

  if result_task.id is not null then
    return jsonb_build_object(
      'id', result_task.id,
      'roomId', result_task.room_id,
      'provider', result_task.provider,
      'kind', result_task.kind,
      'status', result_task.status,
      'createdAt', result_task.created_at,
      'updatedAt', result_task.updated_at
    );
  end if;

  select preference.default_device_id,
         coalesce(target_provider, preference.default_provider)
  into resolved_device_id, resolved_provider
  from public.ai_user_preferences as preference
  where preference.user_id = caller_id;

  if resolved_device_id is null or resolved_provider is null
    or not exists (
      select 1 from public.execution_devices as device
      where device.id = resolved_device_id and device.user_id = caller_id
        and device.status = 'active' and device.revoked_at is null
    )
    or not exists (
      select 1 from public.provider_connections as connection
      where connection.device_id = resolved_device_id
        and connection.user_id = caller_id
        and connection.provider = resolved_provider
        and connection.installation = 'installed'
        and connection.authentication = 'authenticated'
        and connection.compatibility = 'supported'
    )
  then
    raise exception 'invalid_user_flow_generate_request' using errcode = 'P0001';
  end if;

  frozen_manifest := jsonb_build_object(
    'messageIds', (select coalesce(jsonb_agg(m.id order by m.created_at, m.id), '[]'::jsonb)
      from public.messages as m where m.room_id = target_room_id),
    'attachmentIds', (select coalesce(jsonb_agg(a.id order by a.created_at, a.id), '[]'::jsonb)
      from public.attachments as a where a.room_id = target_room_id
        and a.message_id is not null and a.discard_pending = false),
    'evidenceIds', (select coalesce(jsonb_agg(e.id order by e.created_at, e.id), '[]'::jsonb)
      from public.evidence as e where e.room_id = target_room_id),
    'decisionIds', (select coalesce(jsonb_agg(d.id order by d.created_at, d.id), '[]'::jsonb)
      from public.decisions as d where d.room_id = target_room_id)
  );

  insert into public.ai_tasks (
    initiating_user_id, workspace_id, room_id, device_id, provider, kind,
    status, instruction, context_manifest_json, context_revision,
    source_message_id
  ) values (
    caller_id, target_workspace_id, target_room_id, resolved_device_id,
    resolved_provider, 'user_flow_generate', 'queued',
    left(coalesce(clarification,
      'Generate one primary user flow from the authorized room context.'), 20000),
    frozen_manifest,
    0,
    target_source_message_id
  ) returning * into result_task;

  return jsonb_build_object(
    'id', result_task.id,
    'roomId', result_task.room_id,
    'provider', result_task.provider,
    'kind', result_task.kind,
    'status', result_task.status,
    'createdAt', result_task.created_at,
    'updatedAt', result_task.updated_at
  );
exception when unique_violation then
  select task.* into result_task
  from public.ai_tasks as task
  where task.kind = 'user_flow_generate'
    and (
      task.source_message_id = target_source_message_id
      or (
        task.room_id = target_room_id
        and task.initiating_user_id = caller_id
        and task.status in ('queued', 'waiting_for_device', 'ready_to_run', 'running')
      )
    )
  order by (task.source_message_id is distinct from target_source_message_id),
    task.created_at, task.id limit 1;
  if result_task.id is null then
    raise exception 'invalid_user_flow_generate_request' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'id', result_task.id, 'roomId', result_task.room_id,
    'provider', result_task.provider, 'kind', result_task.kind,
    'status', result_task.status, 'createdAt', result_task.created_at,
    'updatedAt', result_task.updated_at
  );
end;
$$;

revoke all on function public.create_user_flow_generate_task_internal(
  uuid, public.ai_provider, text, uuid
) from public, anon, authenticated, service_role;

create or replace function public.create_user_flow_generate_task(
  target_room_id uuid,
  target_provider public.ai_provider default null,
  target_clarification text default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.create_user_flow_generate_task_internal(
    target_room_id,
    target_provider,
    target_clarification,
    null
  );
$$;

revoke all on function public.create_user_flow_generate_task(
  uuid, public.ai_provider, text
) from public, anon, service_role;
grant execute on function public.create_user_flow_generate_task(
  uuid, public.ai_provider, text
) to authenticated;

create function public.accept_proposed_user_flow(target_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  proposal public.messages;
  lifecycle public.user_flows;
  generation_task jsonb;
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

  if proposal.proposed_action ->> 'kind' is distinct from 'user_flow_generate'
  then
    raise exception 'User flow proposal required' using errcode = 'P0001';
  end if;

  -- The same idempotent start the Room's own control uses, and the same edit
  -- requirement: a view-only participant may dismiss but never generate.
  lifecycle := public.start_user_flow(proposal.room_id);

  -- The manifest the helper freezes here is the Room as it stands at
  -- acceptance, not as it stood when the Product Agent proposed.
  generation_task := public.create_user_flow_generate_task_internal(
    proposal.room_id,
    null,
    null,
    proposal.id
  );

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
