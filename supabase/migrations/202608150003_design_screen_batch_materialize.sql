-- A design-screen generation task now returns a batch of screens
-- (`result_json.payload.screens[]`), each naming itself with `screenKey` and
-- linking others by `targetScreenKey` inside its actions. The materializer
-- must fan a batch out into N `design_screens` rows/versions instead of one.
--
-- `design_screen_versions_originating_task` was a *unique* index on
-- `originating_task_id`, which assumed exactly one version per task. A batch
-- writes one version per screen for the same task, so that assumption no
-- longer holds -- replace it with a plain (non-unique) lookup index, and
-- teach `get_design_screen_generation` to pick the version for the task's
-- *originating* screen specifically (not an arbitrary row from the batch).

drop index public.design_screen_versions_originating_task;

create index design_screen_versions_originating_task
  on public.design_screen_versions(originating_task_id)
  where originating_task_id is not null;

create or replace function public.get_design_screen_generation(target_task_id uuid)
returns table (
  task_id uuid,
  screen_id uuid,
  version_id uuid,
  promoted boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select generation.task_id,
    generation.screen_id,
    version.id,
    version.promoted
  from public.design_screen_generations as generation
  left join public.design_screen_versions as version
    on version.originating_task_id = generation.task_id
    and version.screen_id = generation.screen_id
  where generation.task_id = target_task_id
    and public.is_room_participant(generation.room_id);
$$;

-- Fan a completed generation task's payload out into one or more screens.
-- Screen 0 always targets the task's originating screen (preserves the
-- pre-batch single-screen contract: the composer pre-creates that screen).
-- Every other element resolves-or-creates a screen in the room by
-- `screenKey`, laying new screens out at increasing `canvas_x`.
create or replace function public.materialize_design_screen_generate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload jsonb;
  screens jsonb;
  generation public.design_screen_generations;
  room_workspace_id uuid;
  elem jsonb;
  idx integer := 0;
  screen_key_val text;
  target_screen public.design_screens;
  base_version uuid;
  next_canvas_x double precision;
  version public.design_screen_versions;
begin
  if new.kind <> 'design_screen_generate'
    or new.status <> 'completed'
    or new.result_json is null
    or coalesce(new.result_json ->> 'partial', 'false') <> 'false'
  then
    return new;
  end if;

  select * into generation
  from public.design_screen_generations
  where task_id = new.id;

  if generation.task_id is null then
    return new;
  end if;

  -- Double-materialization guard: a task that already produced any version
  -- (from a prior trigger run) never re-runs, batch or not.
  if exists (
    select 1
    from public.design_screen_versions
    where originating_task_id = new.id
  ) then
    return new;
  end if;

  payload := new.result_json -> 'payload';
  if payload is null or jsonb_typeof(payload) <> 'object' then
    return new;
  end if;

  if jsonb_typeof(payload -> 'screens') = 'array' then
    screens := payload -> 'screens';
  else
    -- Legacy single-screen shape: no `screens` array, the payload itself is
    -- the one screen. Wrap it as a one-element batch so the rest of the
    -- function is shape-agnostic.
    if jsonb_typeof(payload -> 'markup') <> 'string'
      or jsonb_typeof(payload -> 'actions') <> 'array'
    then
      return new;
    end if;
    screens := jsonb_build_array(payload);
  end if;

  if jsonb_typeof(screens) <> 'array' or jsonb_array_length(screens) = 0 then
    return new;
  end if;

  select room.workspace_id into room_workspace_id
  from public.rooms as room
  where room.id = generation.room_id;

  for elem in select * from jsonb_array_elements(screens)
  loop
    if jsonb_typeof(elem) <> 'object'
      or jsonb_typeof(elem -> 'markup') <> 'string'
      or jsonb_typeof(elem -> 'actions') <> 'array'
    then
      idx := idx + 1;
      continue;
    end if;

    screen_key_val := elem ->> 'screenKey';
    target_screen := null;

    if idx = 0 then
      -- The task's originating screen keeps working exactly as before,
      -- regardless of what key it names itself.
      select * into target_screen
      from public.design_screens
      where id = generation.screen_id;
    elsif screen_key_val is not null then
      select * into target_screen
      from public.design_screens
      where room_id = generation.room_id
        and screen_key = screen_key_val
        and deleted_at is null;
    end if;

    if target_screen.id is null then
      select coalesce(max(screen.canvas_x), 0) + 460 into next_canvas_x
      from public.design_screens as screen
      where screen.room_id = generation.room_id
        and screen.deleted_at is null;

      insert into public.design_screens (
        room_id,
        workspace_id,
        name,
        screen_key,
        canvas_x,
        canvas_y,
        created_by
      ) values (
        generation.room_id,
        room_workspace_id,
        coalesce(
          nullif(initcap(replace(screen_key_val, '-', ' ')), ''),
          'Screen ' || (idx + 1)::text
        ),
        screen_key_val,
        coalesce(next_canvas_x, 0),
        0,
        new.initiating_user_id
      )
      returning * into target_screen;
    elsif screen_key_val is not null
      and target_screen.screen_key is null
      and not exists (
        select 1
        from public.design_screens as other
        where other.room_id = generation.room_id
          and other.screen_key = screen_key_val
          and other.deleted_at is null
          and other.id <> target_screen.id
      )
    then
      -- Stable, coalescing key assignment: only claim the payload's key if
      -- this screen has none yet and no *other* live screen already holds
      -- it -- never point two screens at one key.
      update public.design_screens
      set screen_key = screen_key_val
      where id = target_screen.id
        and screen_key is null;
      target_screen.screen_key := screen_key_val;
    end if;

    base_version := case
      when idx = 0 then generation.base_version_id
      else target_screen.current_version_id
    end;

    version := public.insert_and_promote_screen_version(
      target_screen.id,
      elem ->> 'markup',
      coalesce(elem ->> 'styles', ''),
      elem ->> 'script',
      elem -> 'actions',
      base_version,
      generation.profile_version_id,
      new.id,
      new.initiating_user_id
    );

    perform public.append_design_screen_event(
      generation.room_id,
      target_screen.id,
      'version_created',
      null,
      new.id,
      version.id,
      new.initiating_user_id
    );
    perform public.append_design_screen_event(
      generation.room_id,
      target_screen.id,
      case
        when version.promoted then 'version_promoted'
        else 'stale_candidate'
      end::public.design_event_kind,
      null,
      new.id,
      version.id,
      new.initiating_user_id
    );

    idx := idx + 1;
  end loop;

  return new;
end;
$$;

revoke all on function public.materialize_design_screen_generate() from public, anon, authenticated, service_role;
grant execute on function public.materialize_design_screen_generate()
  to service_role;
