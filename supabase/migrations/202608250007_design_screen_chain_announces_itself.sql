-- A chained generation stopped telling the browser anything.
--
-- The chain advances inside the database, but every client refresh path hangs
-- off the browser's own task poller, which idles the moment no task is
-- non-terminal (`room-task-status.ts:180-186`). Between two chain links there
-- is always such a moment, so the browser never learned the chain continued --
-- the turn kept its last rendered state and said "building the next..." four
-- minutes after every link had settled.
--
-- A chain link now appends `generation_started`, exactly as a person-initiated
-- generation does. That event already rides a realtime subscription the room is
-- listening on.

CREATE OR REPLACE FUNCTION public.queue_design_screen_chain_step(parent_task_id uuid, screen_keys text[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  parent_task public.ai_tasks;
  parent_generation public.design_screen_generations;
  placeholder public.design_screens;
  next_task public.ai_tasks;
  next_x double precision;
  blocks_at integer;
  parent_blocks text;
  next_instruction text;
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

  -- A device that has since been revoked -- or that never belonged to the
  -- person who started this -- ends the chain quietly rather than queueing
  -- work nothing can claim.
  if not exists (
    select 1 from public.execution_devices as device
    where device.id = parent_task.device_id
      and device.user_id = parent_task.initiating_user_id
      and device.status = 'active'
      and device.revoked_at is null
  ) then
    return null;
  end if;

  -- The same check the person's own send makes. A connection that has been
  -- signed out of, uninstalled or become unsupported cannot run this, so
  -- there is nothing to gain by queueing it.
  if not exists (
    select 1 from public.provider_connections as connection
    where connection.device_id = parent_task.device_id
      and connection.user_id = parent_task.initiating_user_id
      and connection.provider = parent_task.provider
      and connection.installation = 'installed'
      and connection.authentication = 'authenticated'
      and connection.compatibility = 'supported'
  ) then
    return null;
  end if;

  -- Everything after the parent's first blank line is its context blocks.
  -- No blank line means there were no blocks to inherit, and the directive
  -- stands on its own.
  parent_blocks := null;
  blocks_at := position(E'\n\n' in coalesce(parent_task.instruction, ''));
  if blocks_at > 0 then
    parent_blocks := substr(parent_task.instruction, blocks_at + 2);
  end if;

  next_instruction := 'build these screens for the flow: '
    || array_to_string(screen_keys, ', ');
  if nullif(btrim(coalesce(parent_blocks, '')), '') is not null then
    next_instruction := next_instruction || E'\n\n' || parent_blocks;
  end if;
  -- 20,000 -- this column's own CHECK constraint and MAX_INSTRUCTION_CHARS
  -- in the contracts package both stop there.
  next_instruction := left(next_instruction, 20000);

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
    next_instruction,
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

  -- Announce the link.
  --
  -- The chain advances inside the database, but every client refresh path is
  -- driven by the browser's own task poller, and that goes idle the moment
  -- nothing is non-terminal. Between two links there is always such a moment --
  -- link N settled, link N+1 not yet seen -- so without this the browser never
  -- learns the chain continued: the turn spins on its last rendered state for
  -- ever, saying "building the next..." long after everything has stopped.
  --
  -- Task 2 deliberately skipped this, reasoning that a second
  -- `generation_started` would undercut folding a chain into one turn. That was
  -- wrong about the consumer: turns fold by `chain_id`, while this event feeds
  -- the realtime subscription and the per-screen history drawer. It adds no
  -- turn; it is how the browser hears anything at all.
  perform public.append_design_screen_event(
    parent_task.room_id,
    placeholder.id,
    'generation_started',
    null,
    next_task.id,
    null,
    parent_task.initiating_user_id
  );

  return next_task.id;
end;
$function$


