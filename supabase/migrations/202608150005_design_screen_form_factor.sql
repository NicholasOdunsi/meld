-- Screens declare the device form factor they were designed for so the canvas
-- frame is created at the right size instead of a fixed phone-portrait box the
-- user has to expand by hand. The model returns `formFactor` per screen; the
-- batch materialization writes it onto design_screens.

alter table public.design_screens
  add column form_factor text not null default 'desktop'
  check (form_factor in ('mobile', 'tablet', 'desktop'));

-- Re-declare the batch materialization (from 202608150003) to also persist each
-- screen's form factor: a valid `formFactor` is stored on insert and updated on
-- regeneration; an absent/invalid value leaves an existing screen's form factor
-- untouched (and defaults new screens to 'desktop').
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
  form_factor_val text;
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
    -- Only a recognized form factor is honored; anything else is ignored so the
    -- existing value (or the column default) stands.
    form_factor_val := case
      when elem ->> 'formFactor' in ('mobile', 'tablet', 'desktop')
        then elem ->> 'formFactor'
      else null
    end;
    target_screen := null;

    if idx = 0 then
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
        form_factor,
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
        coalesce(form_factor_val, 'desktop'),
        coalesce(next_canvas_x, 0),
        0,
        new.initiating_user_id
      )
      returning * into target_screen;
    else
      if screen_key_val is not null
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
        update public.design_screens
        set screen_key = screen_key_val
        where id = target_screen.id
          and screen_key is null;
        target_screen.screen_key := screen_key_val;
      end if;

      -- The frame follows the current design: a declared form factor updates the
      -- existing screen; an absent one leaves it as-is.
      if form_factor_val is not null then
        update public.design_screens
        set form_factor = form_factor_val
        where id = target_screen.id;
      end if;
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
