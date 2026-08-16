-- Shared layouts: the materializer fans a screen element's optional "layout"
-- field out into design_layouts rows.
--
-- Each element may carry:
--   {"reuse": {"layoutKey": K}}   -- point the screen at the live layout
--                                    already keyed K in this room (if any).
--   {"create": {"layoutKey": K, "name": N, "shellMarkup": M, "shellStyles": S,
--     "actions": A}}              -- resolve-or-create the layout keyed K and
--                                    write a new version onto it, then point
--                                    the screen at it. Skipped if M has no
--                                    `data-meld-slot` (an unusable shell).
--   absent / null                -- leave the screen's layout_id untouched
--                                    for this materialization.
--
-- Resolve-or-create for the "create" branch is purely BY layout_key --
-- mirroring the idx>0 screen branch (resolve-or-create by screen_key), NOT
-- the idx=0 branch. A layout has no fixed identity independent of its key
-- the way the idx=0 screen has a fixed identity (generation.screen_id) that
-- must claim a key away from someone else: a layout IS its key. Anchoring
-- instead on "this screen's current layout" would let a regeneration that
-- declares a *different* key rename (and overwrite the shell of) a layout
-- that other screens are still relying on -- exactly the cross-screen drift
-- shared layouts exist to prevent. So there is no Policy A displacement
-- here: resolving by key can never find a "different" live holder to
-- displace, because the room-scoped partial unique index on
-- (room_id, layout_key) already guarantees at most one live layout per key.
-- A "create" with a key that differs from the screen's current layout's key
-- always produces (or reuses) a DIFFERENT layout row; a "create" with the
-- SAME key as an existing live layout writes a new version onto that same
-- row (the intended "edit the shell, every screen using it updates"
-- behavior).
--
-- Only the layout branch is new. Screen resolution, versioning, events, and
-- the replay guard are carried over verbatim from 202608150011.

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
  layout_elem jsonb;
  layout_key_val text;
  layout_name_val text;
  layout_shell_markup_val text;
  layout_shell_styles_val text;
  layout_actions_val jsonb;
  target_layout public.design_layouts;
  layout_version public.design_layout_versions;
  layout_id_val uuid;
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
    then
      -- Policy A: the screen being generated claims the key it declares. If a
      -- different live screen currently holds it, that incumbent yields --
      -- its key is nulled -- so the actively generated screen is addressable
      -- by the name it declares instead of being silently orphaned. This
      -- never leaves two live screens sharing one key.
      update public.design_screens
      set screen_key = null
      where room_id = generation.room_id
        and screen_key = screen_key_val
        and deleted_at is null
        and id <> target_screen.id;

      update public.design_screens
      set screen_key = screen_key_val
      where id = target_screen.id
        and screen_key is null;
      target_screen.screen_key := screen_key_val;
    end if;

    -- Layout fan-out: compute layout_id_val from the element's optional
    -- "layout" field before writing the screen's own version.
    layout_id_val := null;
    layout_elem := elem -> 'layout';

    if jsonb_typeof(layout_elem) = 'object' then
      if jsonb_typeof(layout_elem -> 'reuse') = 'object' then
        layout_key_val := layout_elem -> 'reuse' ->> 'layoutKey';
        if layout_key_val is not null then
          select layout.id into layout_id_val
          from public.design_layouts as layout
          where layout.room_id = generation.room_id
            and layout.layout_key = layout_key_val
            and layout.deleted_at is null;
        end if;
      elsif jsonb_typeof(layout_elem -> 'create') = 'object' then
        layout_shell_markup_val := layout_elem -> 'create' ->> 'shellMarkup';

        if layout_shell_markup_val is not null
          and layout_shell_markup_val ~ 'data-meld-slot'
        then
          layout_key_val := layout_elem -> 'create' ->> 'layoutKey';
          layout_shell_styles_val := coalesce(layout_elem -> 'create' ->> 'shellStyles', '');
          layout_actions_val := coalesce(layout_elem -> 'create' -> 'actions', '[]'::jsonb);
          layout_name_val := coalesce(
            nullif(btrim(layout_elem -> 'create' ->> 'name'), ''),
            nullif(initcap(replace(layout_key_val, '-', ' ')), ''),
            'Layout'
          );

          target_layout := null;

          -- Resolve-or-create purely by key, mirroring the idx>0 screen
          -- branch: a layout is identified by its key, so there is never a
          -- competing live holder to displace.
          if layout_key_val is not null then
            select * into target_layout
            from public.design_layouts as layout
            where layout.room_id = generation.room_id
              and layout.layout_key = layout_key_val
              and layout.deleted_at is null;
          end if;

          if target_layout.id is null then
            insert into public.design_layouts (
              room_id,
              workspace_id,
              layout_key,
              name,
              created_by
            ) values (
              generation.room_id,
              room_workspace_id,
              layout_key_val,
              layout_name_val,
              new.initiating_user_id
            )
            returning * into target_layout;
          end if;

          layout_version := public.insert_and_promote_layout_version(
            target_layout.id,
            layout_shell_markup_val,
            layout_shell_styles_val,
            layout_actions_val,
            target_layout.current_version_id,
            generation.profile_version_id,
            new.id,
            new.initiating_user_id
          );

          layout_id_val := target_layout.id;
        end if;
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

    if layout_id_val is not null then
      update public.design_screens
      set layout_id = layout_id_val
      where id = target_screen.id;
    end if;

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
