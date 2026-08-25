-- A generation writes nothing until the model finishes the whole batch, and the
-- provider cuts a run off at 12 minutes. "Design the full flow" therefore
-- attempted nine-plus screens, ran past the ceiling and was discarded whole --
-- 722 seconds, not one screen saved, three times.
--
-- A request becomes a chain of short runs instead. These columns carry the
-- chain across the runs that make it up.

alter table public.design_screen_generations
  add column if not exists chain_id uuid,
  add column if not exists chain_remaining text[] not null default '{}',
  add column if not exists chain_step integer not null default 0,
  -- The flow's size as the first run saw it: what it built plus what it named.
  -- Stored rather than derived, because `chain_remaining` shrinks as the chain
  -- advances -- recomputing the total from it would make the progress count
  -- appear to go backwards, which reads as a bug even when nothing is wrong.
  add column if not exists chain_total integer not null default 0;

-- Finding a chain's other runs is the transcript's hot path.
create index if not exists design_screen_generations_chain
  on public.design_screen_generations (chain_id)
  where chain_id is not null;

-- The trigger-safe twin of create_design_screen_generate_task.
--
-- The chain is queued from inside materialize_design_screen_generate, where
-- there is no JWT -- so `auth.uid()` is null and the existing RPC refuses. This
-- takes the initiating user from the parent task instead, and inherits the
-- parent's device, provider and model rather than re-reading preferences: a
-- chain started on Opus must finish on Opus, not switch to a default halfway
-- through a flow.
create or replace function public.queue_design_screen_chain_step(
  parent_task_id uuid,
  screen_keys text[]
) returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  parent_task public.ai_tasks;
  parent_generation public.design_screen_generations;
  placeholder public.design_screens;
  next_task public.ai_tasks;
  next_x double precision;
begin
  if screen_keys is null or array_length(screen_keys, 1) is null then
    return null;
  end if;

  select * into parent_task from public.ai_tasks where id = parent_task_id;
  if not found then
    return null;
  end if;

  select * into parent_generation
  from public.design_screen_generations where task_id = parent_task_id;
  if not found then
    return null;
  end if;

  -- Three follow-ups, four runs. Step 3 is the last link.
  if parent_generation.chain_step >= 3 then
    return null;
  end if;

  -- A device that has since been revoked ends the chain quietly rather than
  -- queueing work nothing can claim.
  if not exists (
    select 1 from public.execution_devices
    where id = parent_task.device_id
      and status = 'active'
      and revoked_at is null
  ) then
    return null;
  end if;

  select coalesce(max(canvas_x), 0) + 460 into next_x
  from public.design_screens
  where room_id = parent_task.room_id and deleted_at is null;

  -- The placeholder resolves to whichever key the model declares, through the
  -- idx-0-resolves-by-key rule in 202608230007.
  insert into public.design_screens (
    room_id, workspace_id, name, canvas_x, canvas_y, created_by
  ) values (
    parent_task.room_id,
    parent_task.workspace_id,
    'Screen',
    coalesce(next_x, 0),
    0,
    parent_task.initiating_user_id
  )
  returning * into placeholder;

  insert into public.ai_tasks (
    initiating_user_id, workspace_id, room_id, device_id, provider, model,
    kind, status, instruction, context_manifest_json, context_revision
  ) values (
    parent_task.initiating_user_id,
    parent_task.workspace_id,
    parent_task.room_id,
    parent_task.device_id,
    parent_task.provider,
    parent_task.model,
    'design_screen_generate',
    'queued',
    'build these screens for the flow: ' || array_to_string(screen_keys, ', '),
    parent_task.context_manifest_json,
    parent_task.context_revision
  )
  returning * into next_task;

  insert into public.design_screen_generations (
    task_id, screen_id, room_id, base_version_id, profile_version_id,
    chain_id, chain_remaining, chain_step, chain_total
  ) values (
    next_task.id,
    placeholder.id,
    parent_task.room_id,
    null,
    parent_generation.profile_version_id,
    coalesce(parent_generation.chain_id, parent_task_id),
    screen_keys,
    parent_generation.chain_step + 1,
    parent_generation.chain_total
  );

  update public.design_screens
  set updating = true, updated_at = now()
  where id = placeholder.id;

  return next_task.id;
end;
$$;

revoke all on function public.queue_design_screen_chain_step(uuid, text[]) from public;
