-- Insert an immutable screen version and attempt to promote it via
-- compare-and-swap. A lost CAS retains the new row as a stale candidate.
create function public.insert_and_promote_screen_version(
  target_screen_id uuid,
  new_markup text,
  new_styles text,
  new_script text,
  new_actions jsonb,
  base_version uuid,
  profile_version uuid,
  task_id uuid,
  author uuid
)
returns public.design_screen_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  screen public.design_screens;
  inserted public.design_screen_versions;
  promoted_count integer;
begin
  select * into screen
  from public.design_screens
  where id = target_screen_id
  for update;

  if screen.id is null then
    raise exception 'design_screen_not_found' using errcode = 'P0001';
  end if;

  insert into public.design_screen_versions (
    screen_id,
    room_id,
    markup,
    styles,
    script,
    actions_json,
    base_version_id,
    profile_version_id,
    originating_task_id,
    created_by
  ) values (
    target_screen_id,
    screen.room_id,
    new_markup,
    new_styles,
    new_script,
    new_actions,
    base_version,
    profile_version,
    task_id,
    author
  )
  returning * into inserted;

  update public.design_screens
  set current_version_id = inserted.id,
      state = 'built',
      updating = false,
      updated_at = now()
  where id = target_screen_id
    and current_version_id is not distinct from base_version;

  get diagnostics promoted_count = row_count;

  if promoted_count > 0 then
    update public.design_screen_versions
    set promoted = true
    where id = inserted.id;
    inserted.promoted := true;
  else
    update public.design_screens
    set updating = false,
        updated_at = now()
    where id = target_screen_id;
  end if;

  return inserted;
end;
$$;

revoke all on function public.insert_and_promote_screen_version(
  uuid,
  text,
  text,
  text,
  jsonb,
  uuid,
  uuid,
  uuid,
  uuid
) from public, anon, authenticated, service_role;
grant execute on function public.insert_and_promote_screen_version(
  uuid,
  text,
  text,
  text,
  jsonb,
  uuid,
  uuid,
  uuid,
  uuid
) to service_role;
