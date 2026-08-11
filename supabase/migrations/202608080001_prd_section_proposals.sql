-- A section revision is a durable AI task whose output becomes a reviewable
-- proposal. Applying a proposal creates the next normal PRD draft version;
-- the model never writes directly into the document.

alter type public.ai_task_kind add value if not exists 'prd_section_revise';

create type public.prd_proposal_status as enum (
  'pending', 'ready', 'applied', 'discarded', 'failed'
);

create table public.prd_proposals (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  organization_id uuid not null,
  task_id uuid not null unique references public.ai_tasks(id) on delete cascade,
  base_prd_id uuid not null references public.prds(id) on delete restrict,
  base_version integer not null check (base_version >= 1),
  section_field text not null check (section_field in (
    'executiveSummary', 'problemAndEvidence', 'targetUsersAndUseCases',
    'goalsNonGoalsAndMetrics', 'proposedSolution', 'userJourneys',
    'functionalRequirements', 'nonFunctionalRequirements',
    'uxStatesAndEdgeCases', 'dependenciesAndConstraints',
    'risksAndMitigations', 'mvpScope', 'acceptanceCriteria',
    'openQuestions', 'decisionHistory'
  )),
  section_label text not null check (char_length(section_label) between 1 and 200),
  instruction text not null check (char_length(btrim(instruction)) between 1 and 20000),
  quoted_text text check (quoted_text is null or char_length(quoted_text) <= 10000),
  previous_value jsonb not null,
  proposed_value jsonb,
  status public.prd_proposal_status not null default 'pending',
  error_message text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  applied_at timestamptz,
  discarded_at timestamptz,
  foreign key (room_id, organization_id)
    references public.discovery_rooms(id, organization_id) on delete cascade
);

create index prd_proposals_room_created_at_idx
  on public.prd_proposals (room_id, created_at desc, id desc);

create unique index prd_proposals_one_active_section
  on public.prd_proposals (room_id, section_field)
  where status in ('pending', 'ready');

alter table public.prd_proposals enable row level security;
revoke all on table public.prd_proposals from anon;
revoke all on table public.prd_proposals from authenticated, service_role;
grant select on table public.prd_proposals to authenticated, service_role;

create policy "Room participants can view PRD proposals"
on public.prd_proposals for select to authenticated
using (public.is_room_participant(room_id));

create function public.create_prd_section_revise_task(
  target_room_id uuid,
  target_section_field text,
  target_section_label text,
  target_instruction text,
  target_quoted_text text default null,
  target_provider public.ai_provider default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_organization_id uuid;
  resolved_device_id uuid;
  resolved_provider public.ai_provider;
  current_prd public.prds%rowtype;
  frozen_manifest jsonb;
  result_task public.ai_tasks%rowtype;
begin
  if caller_id is null
    or not public.can_edit_room(target_room_id)
    or target_section_field not in (
      'executiveSummary', 'problemAndEvidence', 'targetUsersAndUseCases',
      'goalsNonGoalsAndMetrics', 'proposedSolution', 'userJourneys',
      'functionalRequirements', 'nonFunctionalRequirements',
      'uxStatesAndEdgeCases', 'dependenciesAndConstraints',
      'risksAndMitigations', 'mvpScope', 'acceptanceCriteria',
      'openQuestions', 'decisionHistory'
    )
    or char_length(btrim(coalesce(target_instruction, ''))) not between 1 and 20000
    or char_length(coalesce(target_section_label, '')) not between 1 and 200
    or char_length(coalesce(target_quoted_text, '')) > 10000
  then
    raise exception 'invalid_prd_section_revise_request' using errcode = 'P0001';
  end if;

  select room.organization_id into target_organization_id
  from public.discovery_rooms as room
  where room.id = target_room_id;

  select prd.* into current_prd
  from public.prds as prd
  where prd.room_id = target_room_id
  order by prd.version desc, prd.id desc
  limit 1;

  if current_prd.id is null then
    raise exception 'invalid_prd_section_revise_request' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      target_room_id::text || ':' || target_section_field, 1
    )
  );

  select proposal.task_id into result_task.id
  from public.prd_proposals as proposal
  where proposal.room_id = target_room_id
    and proposal.section_field = target_section_field
    and proposal.status in ('pending', 'ready')
  order by proposal.created_at, proposal.id
  limit 1;

  if result_task.id is not null then
    select task.* into result_task
    from public.ai_tasks as task
    where task.id = result_task.id;
    return jsonb_build_object(
      'id', result_task.id, 'roomId', result_task.room_id,
      'provider', result_task.provider, 'kind', result_task.kind,
      'status', result_task.status, 'createdAt', result_task.created_at,
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
    raise exception 'invalid_prd_section_revise_request' using errcode = 'P0001';
  end if;

  frozen_manifest := jsonb_build_object(
    'messageIds', (select coalesce(jsonb_agg(m.id order by m.created_at, m.id),'[]'::jsonb)
      from public.messages as m where m.room_id = target_room_id),
    'attachmentIds', (select coalesce(jsonb_agg(a.id order by a.created_at, a.id),'[]'::jsonb)
      from public.attachments as a where a.room_id = target_room_id
        and a.message_id is not null and a.discard_pending = false),
    'evidenceIds', (select coalesce(jsonb_agg(e.id order by e.created_at, e.id),'[]'::jsonb)
      from public.evidence as e where e.room_id = target_room_id),
    'decisionIds', (select coalesce(jsonb_agg(d.id order by d.created_at, d.id),'[]'::jsonb)
      from public.decisions as d where d.room_id = target_room_id),
    'targetSection', jsonb_build_object(
      'field', target_section_field,
      'label', btrim(target_section_label),
      'quotedText', nullif(target_quoted_text, '')
    ),
    'existingPrd', jsonb_build_object(
      'version', current_prd.version,
      'document', current_prd.document
    )
  );

  insert into public.ai_tasks (
    initiating_user_id, organization_id, room_id, device_id, provider, kind,
    status, instruction, context_manifest_json, context_revision
  ) values (
    caller_id, target_organization_id, target_room_id, resolved_device_id,
    resolved_provider, 'prd_section_revise', 'queued',
    btrim(target_instruction), frozen_manifest, current_prd.version
  ) returning * into result_task;

  insert into public.prd_proposals (
    room_id, organization_id, task_id, base_prd_id, base_version,
    section_field, section_label, instruction, quoted_text, previous_value,
    created_by
  ) values (
    target_room_id, target_organization_id, result_task.id, current_prd.id,
    current_prd.version, target_section_field, btrim(target_section_label),
    btrim(target_instruction), nullif(target_quoted_text, ''),
    current_prd.document -> target_section_field, caller_id
  );

  return jsonb_build_object(
    'id', result_task.id, 'roomId', result_task.room_id,
    'provider', result_task.provider, 'kind', result_task.kind,
    'status', result_task.status, 'createdAt', result_task.created_at,
    'updatedAt', result_task.updated_at
  );
end;
$$;

revoke all on function public.create_prd_section_revise_task(
  uuid, text, text, text, text, public.ai_provider
) from public, anon, authenticated, service_role;
grant execute on function public.create_prd_section_revise_task(
  uuid, text, text, text, text, public.ai_provider
) to authenticated;

create function public.materialize_prd_section_proposal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload jsonb;
begin
  if new.kind <> 'prd_section_revise' then
    return new;
  end if;

  if new.status = 'completed' and new.result_json is not null then
    payload := new.result_json -> 'payload' -> 'value';
    if payload is not null then
      update public.prd_proposals
      set proposed_value = payload, status = 'ready', error_message = null,
          updated_at = now()
      where task_id = new.id and status = 'pending';
    else
      update public.prd_proposals
      set status = 'failed', error_message = 'The task returned no section value.',
          updated_at = now()
      where task_id = new.id and status = 'pending';
    end if;
  elsif new.status in ('failed', 'cancelled', 'needs_review', 'needs_reauthentication', 'usage_limit_reached') then
    update public.prd_proposals
    set status = 'failed', error_message = 'The Product Agent task did not complete.',
        updated_at = now()
    where task_id = new.id and status = 'pending';
  end if;

  return new;
end;
$$;

create trigger ai_tasks_materialize_prd_section_proposal
  after update on public.ai_tasks
  for each row execute function public.materialize_prd_section_proposal();

create function public.apply_prd_proposal(target_proposal_id uuid)
returns public.prds
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  proposal public.prd_proposals%rowtype;
  current_prd public.prds%rowtype;
  saved_prd public.prds%rowtype;
begin
  select p.* into proposal from public.prd_proposals as p
  where p.id = target_proposal_id for update;
  if proposal.id is null or caller_id is null
    or not public.can_edit_room(proposal.room_id)
    or proposal.status <> 'ready'
    or proposal.proposed_value is null
  then
    raise exception 'prd_proposal_not_ready' using errcode = 'P0001';
  end if;

  select p.* into current_prd from public.prds as p
  where p.room_id = proposal.room_id
  order by p.version desc, p.id desc limit 1 for update;
  if current_prd.version is distinct from proposal.base_version then
    raise exception 'prd_proposal_conflict' using errcode = 'P0001';
  end if;

  insert into public.prds (
    room_id, organization_id, version, status, document, owner_id, created_by
  ) values (
    current_prd.room_id, current_prd.organization_id, current_prd.version + 1,
    'draft', jsonb_set(current_prd.document,
      array[proposal.section_field], proposal.proposed_value, false),
    current_prd.owner_id, caller_id
  ) returning * into saved_prd;

  update public.prd_proposals
  set status = 'applied', applied_at = now(), updated_at = now()
  where id = proposal.id;
  return saved_prd;
end;
$$;

revoke all on function public.apply_prd_proposal(uuid) from public, anon, authenticated, service_role;
grant execute on function public.apply_prd_proposal(uuid) to authenticated;

create function public.discard_prd_proposal(target_proposal_id uuid)
returns public.prd_proposals
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  proposal public.prd_proposals%rowtype;
begin
  select p.* into proposal from public.prd_proposals as p
  where p.id = target_proposal_id for update;
  if proposal.id is null or caller_id is null
    or not public.can_edit_room(proposal.room_id)
    or proposal.status not in ('pending', 'ready')
  then
    raise exception 'prd_proposal_not_discardable' using errcode = 'P0001';
  end if;
  update public.prd_proposals
  set status = 'discarded', discarded_at = now(), updated_at = now()
  where id = proposal.id
  returning * into proposal;
  return proposal;
end;
$$;

revoke all on function public.discard_prd_proposal(uuid) from public, anon, authenticated, service_role;
grant execute on function public.discard_prd_proposal(uuid) to authenticated;
