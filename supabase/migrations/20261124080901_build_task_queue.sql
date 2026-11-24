create table public.build_task_jobs (
  task_id uuid primary key references public.ai_tasks(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  star_task_id uuid references public.build_stars(star_task_id) on delete cascade,
  source_message_id uuid references public.messages(id) on delete cascade,
  approval_id text,
  payload jsonb not null,
  unique (source_message_id)
);

create index build_task_jobs_project_idx on public.build_task_jobs (project_id);
create index build_task_jobs_star_idx on public.build_task_jobs (star_task_id, approval_id);
alter table public.build_task_jobs enable row level security;
revoke all on public.build_task_jobs from public, anon, authenticated, service_role;

-- Generic tasks cannot become executable build jobs. The dedicated queue RPC
-- must create a companion record in the same transaction.
alter table public.ai_tasks add column build_job_id uuid
  generated always as (
    case when kind in ('code_link', 'build_turn', 'build_approval') then id end
  ) stored;
alter table public.ai_tasks add constraint ai_tasks_require_build_job
  foreign key (build_job_id) references public.build_task_jobs(task_id)
  deferrable initially deferred not valid;

alter table public.build_stars
  add column active_build_task_id uuid references public.ai_tasks(id) on delete set null,
  add column reply text,
  add column engine_offline boolean not null default false;

create index build_stars_active_task_idx on public.build_stars (active_build_task_id)
  where active_build_task_id is not null;

create function public.queue_build_task(
  target_room_id uuid,
  target_kind public.ai_task_kind,
  target_provider public.ai_provider,
  target_device_id uuid default null,
  target_model text default null,
  target_link jsonb default null,
  target_star_task_id uuid default null,
  target_source_message_id uuid default null,
  target_approval_id text default null,
  target_approval_decision text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  room_row public.rooms%rowtype;
  code_link public.project_code_links%rowtype;
  build_star public.build_stars%rowtype;
  source_message public.messages%rowtype;
  prior_job public.build_task_jobs%rowtype;
  build_task_id uuid := gen_random_uuid();
  linked_device_id uuid;
  star_id uuid := target_star_task_id;
  context jsonb;
begin
  select * into room_row from public.rooms where id = target_room_id;
  if actor is null or room_row.project_id is null
    or not public.can_edit_room(target_room_id)
    or target_kind is null or target_kind not in ('code_link', 'build_turn', 'build_approval')
    or target_provider is null or target_provider not in ('claude', 'codex')
    or (target_model is not null and char_length(btrim(target_model)) not between 1 and 100)
  then
    raise exception 'invalid_build_task_request' using errcode = 'P0001';
  end if;

  -- Builds in different rooms of the same project share one code link.
  perform 1 from public.projects where id = room_row.project_id for update;

  if target_kind = 'code_link' then
    if target_link is null or jsonb_typeof(target_link) <> 'object' then
      raise exception 'invalid_build_task_request' using errcode = 'P0001';
    end if;

    case target_link ->> 'kind'
      when 'folder' then
        if (target_link - 'kind' - 'localSelectionId') <> '{}'::jsonb
          or coalesce(target_link ->> 'localSelectionId', '') !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
        then
          raise exception 'invalid_build_task_request' using errcode = 'P0001';
        end if;
      when 'github' then
        if (target_link - 'kind' - 'repository') <> '{}'::jsonb
          or char_length(coalesce(target_link ->> 'repository', '')) > 200
          or coalesce(target_link ->> 'repository', '') !~ '^[A-Za-z0-9_][A-Za-z0-9_.-]*/[A-Za-z0-9_][A-Za-z0-9_.-]*$'
        then
          raise exception 'invalid_build_task_request' using errcode = 'P0001';
        end if;
      when 'new_github' then
        if (target_link - 'kind' - 'repository') <> '{}'::jsonb
          or coalesce(target_link ->> 'repository', '') !~ '^[A-Za-z0-9_][A-Za-z0-9_.-]{0,99}$'
        then
          raise exception 'invalid_build_task_request' using errcode = 'P0001';
        end if;
      else
        raise exception 'invalid_build_task_request' using errcode = 'P0001';
    end case;

    if exists (select 1 from public.project_code_links where project_id = room_row.project_id)
      or exists (
        select 1 from public.build_task_jobs job
        join public.ai_tasks task on task.id = job.task_id
        where job.project_id = room_row.project_id and task.kind = 'code_link'
          and task.status in ('queued', 'waiting_for_device', 'ready_to_run', 'running')
      )
    then
      raise exception 'project_code_already_linked_or_linking' using errcode = 'P0001';
    end if;
    linked_device_id := target_device_id;
    context := jsonb_build_object('kind', 'code_link', 'projectId', room_row.project_id, 'target', target_link);
    star_id := null;
  else
    select * into code_link from public.project_code_links where project_id = room_row.project_id;
    if code_link.engine_project_id is null then
      raise exception 'project_code_link_required' using errcode = 'P0001';
    end if;
    linked_device_id := code_link.device_id;
    if target_device_id is not null and target_device_id <> linked_device_id then
      raise exception 'invalid_build_task_request' using errcode = 'P0001';
    end if;

    if star_id is not null then
      select build.* into build_star
      from public.build_stars build
      join public.room_stars star on star.task_id = build.star_task_id
      where star.room_id = target_room_id and build.project_id = room_row.project_id
        and build.star_task_id = star_id
      for update of build;
      if build_star.star_task_id is null then
        raise exception 'invalid_build_task_request' using errcode = 'P0001';
      end if;
    end if;

    if target_kind = 'build_turn' then
      select * into source_message from public.messages
      where id = target_source_message_id and room_id = target_room_id
        and author_type = 'human' and author_id = actor;
      if source_message.id is null or nullif(btrim(source_message.body), '') is null then
        raise exception 'invalid_build_task_request' using errcode = 'P0001';
      end if;

      select * into prior_job from public.build_task_jobs where source_message_id = source_message.id;
      if prior_job.task_id is not null then
        if star_id is not null and prior_job.star_task_id <> star_id then
          raise exception 'invalid_build_task_request' using errcode = 'P0001';
        end if;
        return prior_job.task_id;
      end if;

      if exists (select 1 from public.ai_tasks
        where id = build_star.active_build_task_id
          and status in ('queued', 'waiting_for_device', 'ready_to_run', 'running'))
      then
        raise exception 'build_star_busy' using errcode = 'P0001';
      end if;

      star_id := coalesce(star_id, build_task_id);
      context := jsonb_build_object('kind', 'build_turn', 'starTaskId', star_id,
        'sourceMessageId', source_message.id, 'projectId', room_row.project_id,
        'engineProjectId', code_link.engine_project_id, 'text', left(source_message.body, 20000));
    else
      if target_approval_id is null or target_approval_decision is null
        or target_approval_decision not in ('accept', 'decline')
        or not exists (select 1 from public.ai_tasks
          where id = build_star.active_build_task_id and status = 'running')
        or build_star.pending_approval ->> 'id' is distinct from target_approval_id
      then
        raise exception 'build_approval_stale' using errcode = 'P0001';
      end if;

      select job.* into prior_job
      from public.build_task_jobs job
      join public.ai_tasks task on task.id = job.task_id
      where job.star_task_id = star_id and job.approval_id = target_approval_id
        and task.status not in ('failed', 'cancelled', 'needs_review')
      order by task.created_at desc limit 1;
      if prior_job.task_id is not null then
        if prior_job.payload ->> 'decision' is distinct from target_approval_decision then
          raise exception 'build_approval_stale' using errcode = 'P0001';
        end if;
        return prior_job.task_id;
      end if;
      context := jsonb_build_object('kind', 'build_approval', 'starTaskId', star_id,
        'projectId', room_row.project_id, 'requestId', target_approval_id, 'decision', target_approval_decision);
    end if;
  end if;

  if not exists (
    select 1 from public.execution_devices device
    join public.provider_connections provider on provider.device_id = device.id
    where device.id = linked_device_id and device.user_id = actor
      and device.status = 'active' and device.revoked_at is null
      and provider.user_id = actor and provider.provider = target_provider
      and provider.installation = 'installed' and provider.authentication = 'authenticated'
      and provider.compatibility = 'supported'
  ) then
    raise exception 'invalid_build_task_request' using errcode = 'P0001';
  end if;

  insert into public.ai_tasks (
    id, initiating_user_id, workspace_id, room_id, device_id, provider, kind, status, instruction, model, source_message_id, context_manifest_json
  ) values (
    build_task_id, actor, room_row.workspace_id, target_room_id, linked_device_id, target_provider,
    target_kind, 'queued', 'Build mode task', target_model, source_message.id,
    '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb
  );
  if target_kind = 'build_turn' then
    if star_id = build_task_id then
      insert into public.room_stars(room_id, task_id, title)
      values (target_room_id, star_id, left(btrim(source_message.body), 120));
      insert into public.build_stars(star_task_id, project_id, engine_thread_id, active_build_task_id)
      values (star_id, room_row.project_id, star_id::text, build_task_id);
    else
      update public.build_stars
      set active_build_task_id = build_task_id, status = 'working', pending_approval = null,
        last_step = null, changed_files = '[]'::jsonb, reply = null, engine_offline = false, updated_at = now()
      where star_task_id = star_id;
      insert into public.room_star_followups(room_id, star_task_id, message_id)
      values (target_room_id, star_id, source_message.id)
      on conflict do nothing;
    end if;
  end if;
  insert into public.build_task_jobs(task_id, project_id, star_task_id, source_message_id, approval_id, payload)
  values (build_task_id, room_row.project_id, star_id, source_message.id,
    case when target_kind = 'build_approval' then target_approval_id end, context);
  return build_task_id;
end;
$$;

revoke all on function public.queue_build_task(uuid, public.ai_task_kind, public.ai_provider, uuid, text, jsonb, uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.queue_build_task(uuid, public.ai_task_kind, public.ai_provider, uuid, text, jsonb, uuid, uuid, text, text)
  to authenticated;

create function public.read_claimed_build_task(target_task_id uuid, target_attempt_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select job.payload
  from public.build_task_jobs job
  join public.ai_tasks task on task.id = job.task_id
  join public.ai_task_attempts attempt on attempt.task_id = task.id and attempt.id = target_attempt_id
  join public.rooms room on room.id = task.room_id and room.project_id = job.project_id
  join public.room_participants participant on participant.room_id = room.id
    and participant.user_id = task.initiating_user_id and participant.access = 'edit'
  join public.memberships membership on membership.workspace_id = room.workspace_id
    and membership.user_id = task.initiating_user_id
  where task.id = target_task_id and task.status = 'running'
    and attempt.settled_at is null and attempt.device_id = task.device_id and attempt.lease_expires_at > now()
    and exists (select 1 from public.execution_devices device
      where device.id = task.device_id and device.status = 'active' and device.revoked_at is null)
    and (task.kind = 'code_link' or exists (
      select 1 from public.project_code_links link where link.project_id = job.project_id and link.device_id = task.device_id
    ))
    and (task.kind <> 'build_approval' or exists (
      select 1 from public.build_stars build
      where build.star_task_id = job.star_task_id and build.pending_approval ->> 'id' = job.approval_id
    ));
$$;

revoke all on function public.read_claimed_build_task(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.read_claimed_build_task(uuid, uuid) to service_role;

create function public.project_build_task_event()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  build_event jsonb := new.payload_json -> 'event';
  event_type text := build_event ->> 'type';
  target_star uuid;
begin
  select job.star_task_id into target_star
  from public.build_task_jobs job
  join public.ai_tasks task on task.id = job.task_id and task.kind = 'build_turn'
  where job.task_id = new.task_id;
  if target_star is null then
    raise exception 'invalid_build_task_event' using errcode = 'P0001';
  end if;

  update public.build_stars
  set status = case
        when event_type = 'approval_request' then 'needs_you'
        when event_type = 'status' and build_event ->> 'status' in ('working', 'needs_you') then build_event ->> 'status'
        else status end,
      pending_approval = case
        when event_type = 'approval_request' then build_event -> 'request'
        when event_type = 'status' and build_event ->> 'status' = 'working' then null
        else pending_approval end,
      last_step = case when event_type = 'step' then build_event ->> 'label' else last_step end,
      reply = case when event_type = 'reply' then build_event ->> 'text' else reply end,
      changed_files = case when event_type = 'changed_files' then build_event -> 'files' else changed_files end,
      branch = case when event_type = 'branch' then build_event ->> 'name' else branch end,
      engine_offline = case when event_type = 'engine_offline' then true else false end,
      updated_at = now()
  where star_task_id = target_star and active_build_task_id = new.task_id;
  return new;
end;
$$;

revoke all on function public.project_build_task_event() from public, anon, authenticated, service_role;
create trigger project_build_task_events
after insert on public.ai_task_events
for each row when (new.type = 'build')
execute function public.project_build_task_event();

create function public.project_build_task_settlement()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  job public.build_task_jobs%rowtype;
  result jsonb := new.result_json -> 'payload';
begin
  select * into job from public.build_task_jobs where task_id = new.id;
  if job.task_id is null then return new; end if;

  if new.kind = 'code_link' and new.status = 'completed' and new.result_json is not null then
    if new.result_json ->> 'kind' is distinct from 'code_link'
      or nullif(result ->> 'engineProjectId', '') is null
    then
      raise exception 'invalid_build_task_result' using errcode = 'P0001';
    end if;
    insert into public.project_code_links(project_id, kind, repo_url, display_name, device_id, engine_project_id)
    values (job.project_id, job.payload -> 'target' ->> 'kind', result ->> 'repoUrl',
      result ->> 'displayName', new.device_id, result ->> 'engineProjectId')
    on conflict (project_id) do nothing;
  elsif new.kind = 'build_turn' then
    if new.status = 'completed' and new.result_json is not null then
      if new.result_json ->> 'kind' is distinct from 'build_turn'
        or coalesce(result ->> 'status', '') not in ('done', 'failed', 'cancelled')
      then
        raise exception 'invalid_build_task_result' using errcode = 'P0001';
      end if;
      update public.build_stars
      set status = result ->> 'status', pending_approval = null,
        engine_offline = false, updated_at = now()
      where star_task_id = job.star_task_id and active_build_task_id = new.id;
    elsif new.status in ('failed', 'cancelled', 'needs_review') then
      update public.build_stars
      set status = case when new.status = 'cancelled' then 'cancelled' else 'failed' end,
        pending_approval = null, engine_offline = false, updated_at = now()
      where star_task_id = job.star_task_id and active_build_task_id = new.id;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.project_build_task_settlement() from public, anon, authenticated, service_role;
create trigger project_build_task_settlements
after update of status, result_json on public.ai_tasks
for each row when (new.kind in ('code_link', 'build_turn', 'build_approval')
  and new.status in ('completed', 'failed', 'cancelled', 'needs_review'))
execute function public.project_build_task_settlement();

alter function public.hydrate_authorized_room_context(uuid, uuid)
  rename to hydrate_authorized_room_context_pre_build;
revoke all on function public.hydrate_authorized_room_context_pre_build(uuid, uuid)
  from public, anon, authenticated, service_role;

create function public.hydrate_authorized_room_context(target_task_id uuid, target_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  build_task public.ai_tasks%rowtype;
  context jsonb;
begin
  select * into build_task from public.ai_tasks
  where id = target_task_id and kind in ('code_link', 'build_turn', 'build_approval');
  if build_task.id is null then
    return public.hydrate_authorized_room_context_pre_build(target_task_id, target_attempt_id);
  end if;

  context := public.read_claimed_build_task(target_task_id, target_attempt_id);
  if context is null then
    if exists (
      select 1 from public.ai_task_attempts
      where id = target_attempt_id and task_id = target_task_id
        and settled_at is null and lease_expires_at > now()
    ) then
      perform public.settle_ai_task(target_task_id, build_task.device_id, target_attempt_id,
        'fail', 'permission_changed', 'The build task is no longer authorized.', null, false);
    end if;
    return jsonb_build_object('status', 'rejected', 'reason', 'permission_changed');
  end if;
  return jsonb_build_object('status', 'ready', 'context', context);
end;
$$;

revoke all on function public.hydrate_authorized_room_context(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.hydrate_authorized_room_context(uuid, uuid) to service_role;

create function public.post_build_message(
  target_room_id uuid,
  target_client_id uuid,
  target_body text,
  target_provider public.ai_provider,
  target_model text default null,
  target_star_task_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  source_message public.messages%rowtype;
  queued_task_id uuid;
begin
  select * into source_message
  from public.post_room_message(target_room_id, target_client_id, target_body, '{}'::uuid[], '{}'::uuid[]);
  queued_task_id := public.queue_build_task(
    target_room_id, 'build_turn', target_provider, null, target_model, null,
    target_star_task_id, source_message.id, null, null
  );
  return jsonb_build_object('taskId', queued_task_id, 'messageId', source_message.id);
end;
$$;

revoke all on function public.post_build_message(uuid, uuid, text, public.ai_provider, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.post_build_message(uuid, uuid, text, public.ai_provider, text, uuid)
  to authenticated;
