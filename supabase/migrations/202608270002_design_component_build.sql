-- Sixteen of this workspace's twenty-four components exist only as prose,
-- because the distiller emits html/css for eight hardcoded core components.
-- A pass builds the rest in batches of four, one batch at a time, merging into
-- a COPY of the active version and moving the active pointer only when the
-- whole pass has finished. The live design system is therefore never half
-- rebuilt, and a pass that stops leaves an unused row rather than damage.

create table public.design_component_build_passes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  source_version_id uuid not null
    references public.design_system_profile_versions(id),
  target_version_id uuid not null
    references public.design_system_profile_versions(id),
  provider public.ai_provider not null,
  -- Chosen once, when the pass starts, and reused by every batch: a pass that
  -- hopped between devices mid-run would be answering to two machines.
  device_id uuid not null references public.execution_devices(id),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index design_component_build_passes_workspace
  on public.design_component_build_passes (workspace_id, created_at desc);

create table public.design_component_builds (
  task_id uuid primary key references public.ai_tasks(id) on delete cascade,
  pass_id uuid not null
    references public.design_component_build_passes(id) on delete cascade,
  component_names text[] not null check (
    array_length(component_names, 1) between 1 and 4
  ),
  attempt integer not null default 1 check (attempt between 1 and 2),
  created_at timestamptz not null default now()
);

create index design_component_builds_pass
  on public.design_component_builds (pass_id, created_at);

alter table public.design_component_build_passes enable row level security;
alter table public.design_component_builds enable row level security;

-- Readable by workspace members so the page can show a pass running; never
-- writable from a browser -- the RPC and the trigger own every write. The
-- explicit grant matters: this database's default privileges hand `select` to
-- nobody, so a policy on its own would still read as "permission denied".
revoke all on table public.design_component_build_passes from anon, authenticated;
grant select on table public.design_component_build_passes to authenticated;
revoke all on table public.design_component_builds from anon, authenticated;
grant select on table public.design_component_builds to authenticated;

create policy "Members read component build passes"
  on public.design_component_build_passes for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "Members read component builds"
  on public.design_component_builds for select
  to authenticated
  using (
    exists (
      select 1 from public.design_component_build_passes as pass
      where pass.id = design_component_builds.pass_id
        and public.is_workspace_member(pass.workspace_id)
    )
  );

-- The components still missing markup, oldest-first by their order in the
-- profile so a pass builds them in the order the distiller listed them.
create function public.pending_design_components(target_version_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    array_agg(component ->> 'name' order by ordinality),
    array[]::text[]
  )
  from public.design_system_profile_versions as version,
    lateral jsonb_array_elements(version.profile_json -> 'components')
      with ordinality as entry(component, ordinality)
  where version.id = target_version_id
    and coalesce(component ->> 'html', '') = '';
$$;

-- Queues one batch of at most four. Returns the task id, or null when nothing
-- is left to build -- which is what tells the caller a pass is finished.
create function public.queue_design_component_build_batch(
  target_pass_id uuid,
  target_attempt integer default 1
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  pass public.design_component_build_passes;
  pending text[];
  batch text[];
  new_task_id uuid;
begin
  select * into pass
  from public.design_component_build_passes
  where id = target_pass_id;

  if not found or pass.completed_at is not null then
    return null;
  end if;

  -- What is still missing, minus whatever this pass has already sent twice.
  --
  -- "Retried once, then left as prose" has to be enforced here rather than at
  -- the call site. The materializer's retry branch keys off the batch it just
  -- settled (`attempt = 1`), but the next batch is chosen from `pending`, and
  -- a component that never validates stays in `pending` for ever -- so the
  -- pass alternated attempt 1, attempt 2, attempt 1 ... queueing a model run
  -- each time and never closing. Counting a component's own prior batches
  -- bounds it at two runs and lets the pass finish, leaving the component as
  -- the prose it already was.
  pending := array(
    select candidate.name
    from unnest(public.pending_design_components(pass.target_version_id))
      as candidate(name)
    where (
      select pg_catalog.count(*)
      from public.design_component_builds as prior
      where prior.pass_id = pass.id
        and candidate.name = any(prior.component_names)
    ) < 2
  );

  if coalesce(array_length(pending, 1), 0) = 0 then
    -- Nothing left to send -- either everything built, or what did not build
    -- has had its two goes. Adopt the rebuilt version and close the pass.
    update public.design_system_profiles
    set active_version_id = pass.target_version_id,
        updated_at = now()
    where workspace_id = pass.workspace_id;

    update public.design_component_build_passes
    set completed_at = now()
    where id = pass.id;

    return null;
  end if;

  batch := pending[1:4];

  -- Inserted directly rather than through `create_ai_task`, which takes a
  -- device and no model. This mirrors how a chained screen queues its next
  -- link (202608250004): the pass carries the device and provider chosen when
  -- it started, and every batch reuses them.
  --
  -- The model is pinned to the provider's fast tier. A component is small and
  -- self-contained; the reasoning tier a whole screen needs buys nothing here
  -- and costs minutes per batch. Both names come from the connector's release
  -- manifest, which validates them before a run.
  insert into public.ai_tasks (
    initiating_user_id, workspace_id, room_id, device_id, provider, model,
    kind, status, instruction, context_manifest_json
  ) values (
    pass.created_by,
    pass.workspace_id,
    pass.room_id,
    pass.device_id,
    pass.provider,
    case pass.provider
      when 'codex' then 'gpt-5.4'
      when 'claude' then 'claude-haiku-4-5'
    end,
    'design_component_build',
    'queued',
    'Build ' || array_to_string(batch, ', '),
    '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb
  )
  returning id into new_task_id;

  insert into public.design_component_builds (task_id, pass_id, component_names, attempt)
  values (new_task_id, pass.id, batch, target_attempt);

  return new_task_id;
end;
$$;

-- Starts a pass: copies the active version, then queues the first batch.
create function public.start_design_component_build(
  target_room_id uuid,
  target_provider public.ai_provider
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_workspace_id uuid;
  active_version public.design_system_profile_versions;
  new_version_id uuid;
  new_pass_id uuid;
  resolved_device_id uuid;
begin
  if not coalesce(public.can_edit_room(target_room_id), false) then
    raise insufficient_privilege using message = 'design_system_not_editable';
  end if;

  select room.workspace_id into target_workspace_id
  from public.rooms as room where room.id = target_room_id;

  select version.* into active_version
  from public.design_system_profiles as profile
  join public.design_system_profile_versions as version
    on version.id = profile.active_version_id
  where profile.workspace_id = target_workspace_id;

  if active_version.id is null then
    raise exception using errcode = 'P0001', message = 'no_active_design_system';
  end if;

  -- An unfinished pass for this workspace is resumed rather than duplicated,
  -- so pressing the button twice cannot run two passes over one profile.
  select id into new_pass_id
  from public.design_component_build_passes
  where workspace_id = target_workspace_id and completed_at is null
  order by created_at desc
  limit 1;

  if new_pass_id is not null then
    perform public.queue_design_component_build_batch(new_pass_id, 1);
    return new_pass_id;
  end if;

  insert into public.design_system_profile_versions (
    workspace_id, profile_json, token_css, component_css,
    source_object_path, created_by
  ) values (
    active_version.workspace_id, active_version.profile_json,
    active_version.token_css, active_version.component_css,
    active_version.source_object_path, auth.uid()
  )
  returning id into new_version_id;

  -- The caller's own paired device, exactly as a screen generation resolves
  -- it. Without one there is nothing to run the build on, and a pass whose
  -- tasks can never be claimed would sit queued for ever.
  select preference.default_device_id into resolved_device_id
  from public.ai_user_preferences as preference
  where preference.user_id = auth.uid();

  if resolved_device_id is null then
    raise exception using errcode = 'P0001', message = 'no_execution_device';
  end if;

  insert into public.design_component_build_passes (
    workspace_id, room_id, source_version_id, target_version_id,
    provider, device_id, created_by
  ) values (
    target_workspace_id, target_room_id, active_version.id, new_version_id,
    target_provider, resolved_device_id, auth.uid()
  )
  returning id into new_pass_id;

  perform public.queue_design_component_build_batch(new_pass_id, 1);
  return new_pass_id;
end;
$$;

-- Merges a settled batch into the target version, then advances the pass.
create function public.materialize_design_component_build()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  build public.design_component_builds;
  pass public.design_component_build_passes;
  built jsonb;
  merged jsonb;
  merged_version_id uuid;
  still_missing text[];
begin
  if new.kind <> 'design_component_build'
    or new.status not in ('completed', 'failed', 'cancelled')
    or old.status = new.status
  then
    return new;
  end if;

  select * into build from public.design_component_builds where task_id = new.id;
  if not found then return new; end if;

  select * into pass from public.design_component_build_passes where id = build.pass_id;
  if not found or pass.completed_at is not null then return new; end if;

  -- A batch that did not complete leaves the pass where it is: the active
  -- pointer never moved, so the person keeps the design system they had.
  if new.status <> 'completed' then
    return new;
  end if;

  built := coalesce(new.result_json -> 'payload' -> 'components', '[]'::jsonb);

  -- Merge by name: a built component replaces its prose-only entry in place,
  -- keeping the profile's own ordering.
  select jsonb_set(
    version.profile_json,
    '{components}',
    (
      select coalesce(jsonb_agg(
        case
          when entry.component ->> 'name' in (
            select value ->> 'name' from jsonb_array_elements(built) as value
          )
          then entry.component || (
            select value from jsonb_array_elements(built) as value
            where value ->> 'name' = entry.component ->> 'name'
            limit 1
          )
          else entry.component
        end
        order by entry.ordinality
      ), '[]'::jsonb)
      from jsonb_array_elements(version.profile_json -> 'components')
        with ordinality as entry(component, ordinality)
    )
  ) into merged
  from public.design_system_profile_versions as version
  where version.id = pass.target_version_id;

  -- Written as a NEW version rather than in place. `design_profile_version_immutable`
  -- (202608130005) refuses every update to this table, and it refuses it for a
  -- reason: a version id is the cache key everything downstream pins to -- the
  -- hydrated design context, the screens that record `profile_version_id` --
  -- so a row whose contents changed under a fixed id would leave every one of
  -- them quietly describing something that no longer exists. The pass's target
  -- therefore steps forward one version per merged batch, and the intermediate
  -- rows stay exactly as private as the first copy was: nothing points at them
  -- until the pass finishes and moves the active pointer.
  insert into public.design_system_profile_versions (
    workspace_id, profile_json, token_css, component_css,
    source_object_path, created_by
  )
  select version.workspace_id, merged, version.token_css, version.component_css,
    version.source_object_path, pass.created_by
  from public.design_system_profile_versions as version
  where version.id = pass.target_version_id
  returning id into merged_version_id;

  update public.design_component_build_passes
  set target_version_id = merged_version_id
  where id = pass.id;

  pass.target_version_id := merged_version_id;

  -- A component still missing after its batch completed failed validation in
  -- the connector. It is retried once, then left as prose.
  still_missing := array(
    select name from unnest(build.component_names) as name
    where name = any(public.pending_design_components(pass.target_version_id))
  );

  if coalesce(array_length(still_missing, 1), 0) > 0 and build.attempt = 1 then
    perform public.queue_design_component_build_batch(pass.id, 2);
  else
    perform public.queue_design_component_build_batch(pass.id, 1);
  end if;

  return new;
end;
$$;

-- One materializer per kind, each gated on `new.kind` in its first statement,
-- so the order these fire in cannot matter; the name follows the
-- `ai_tasks_materialize_*` convention every other one uses.
create trigger ai_tasks_materialize_design_component_build
after update on public.ai_tasks
for each row execute function public.materialize_design_component_build();

revoke all on function public.pending_design_components(uuid) from public, anon, authenticated;
revoke all on function public.queue_design_component_build_batch(uuid, integer) from public, anon, authenticated;
revoke all on function public.materialize_design_component_build() from public, anon, authenticated, service_role;
revoke all on function public.start_design_component_build(uuid, public.ai_provider) from public, anon, authenticated;
grant execute on function public.start_design_component_build(uuid, public.ai_provider) to authenticated;
