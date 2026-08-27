-- A placeholder the person started spins for ever.
--
-- 202608250006 retires the placeholders a *chain* creates (chain_step >= 1),
-- deliberately leaving step 0 alone: that screen may be one the person made
-- themselves, and deleting it out from under them would be wrong.
--
-- But retirement did two things, and only one of them was about deletion. A
-- step-0 run that fails, is cancelled, or completes having written nothing
-- still leaves `updating = true` on a screen that will never receive content,
-- because `insert_and_promote_screen_version` is the only other thing that
-- clears it. The tile then claims to be in progress for the life of the room:
-- three of them had been spinning for a day when this was found.
--
-- So the flag is cleared for every stranded placeholder, and the soft delete
-- stays exactly where it was -- bounded to the screens a chain put there.
-- The screen survives, empty and quiet, for the person to keep or delete.
--
-- The status set is unchanged and deliberate: `needs_review`,
-- `needs_reauthentication` and `usage_limit_reached` are not terminal
-- (202607280001 allows each back to `ready_to_run`), so those placeholders are
-- still waiting on an answer and should still read as in progress.

create or replace function public.retire_design_screen_chain_placeholder()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  generation public.design_screen_generations;
begin
  if new.kind <> 'design_screen_generate'
    or new.status not in ('failed', 'cancelled', 'completed')
  then
    return new;
  end if;

  select * into generation
  from public.design_screen_generations
  where task_id = new.id;

  if not found then
    return new;
  end if;

  -- Nothing was ever written for this screen: whatever put it there, it is no
  -- longer in progress.
  update public.design_screens as screen
  set updating = false,
      updated_at = now()
  where screen.id = generation.screen_id
    and screen.deleted_at is null
    and screen.updating
    and screen.current_version_id is null
    and not exists (
      select 1
      from public.design_screen_versions as version
      where version.screen_id = screen.id
    );

  -- Only a chain's own follow-up placeholder is also cleared off the canvas.
  if generation.chain_id is null or generation.chain_step < 1 then
    return new;
  end if;

  update public.design_screens as screen
  set deleted_at = now(),
      updating = false,
      updated_at = now()
  where screen.id = generation.screen_id
    and screen.deleted_at is null
    and screen.current_version_id is null
    and not exists (
      select 1
      from public.design_screen_versions as version
      where version.screen_id = screen.id
    );

  return new;
end;
$$;

-- The placeholders already stranded by runs that ended before this migration.
update public.design_screens as screen
set updating = false,
    updated_at = now()
where screen.updating
  and screen.deleted_at is null
  and screen.current_version_id is null
  and not exists (
    select 1
    from public.design_screen_versions as version
    where version.screen_id = screen.id
  )
  and exists (
    select 1
    from public.design_screen_generations as generation
    join public.ai_tasks as task on task.id = generation.task_id
    where generation.screen_id = screen.id
      and task.status in ('failed', 'cancelled', 'completed')
  );
