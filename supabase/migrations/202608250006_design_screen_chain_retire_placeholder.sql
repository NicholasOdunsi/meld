-- Orphaned placeholders spin forever.
--
-- `queue_design_screen_chain_step` puts an empty `design_screens` row on the
-- canvas with `updating = true` before the follow-up runs, so the person can
-- see the next screen coming. Only `insert_and_promote_screen_version` ever
-- clears `updating` -- so a link that fails, is cancelled, or completes with
-- a batch that parses to nothing leaves a nameless "Screen" tile spinning on
-- the canvas forever. Up to three per chain, and every one of them put there
-- by the system rather than by the person, who now has to work out that they
-- are debris and delete them by hand.
--
-- When a chained link ends and its placeholder never received a version, the
-- placeholder is retired: soft-deleted, and `updating` cleared so nothing is
-- left claiming to be in progress.
--
-- Strictly bounded to screens the chain itself created:
--
--   chain_step >= 1 -- step 0 is the run the person started, on a screen they
--   may well have made themselves. Only a follow-up's placeholder qualifies.
--
--   no version, ever -- a screen that received content is the chain's output,
--   not its debris, whatever the task's status says.
--
-- `completed` is included alongside `failed` and `cancelled` because a run
-- whose every element is malformed ends well as far as the provider is
-- concerned and still writes nothing -- the placeholder is stranded exactly
-- as a failure strands it. `needs_review`, `needs_reauthentication` and
-- `usage_limit_reached` are NOT terminal (202607280001 allows each back to
-- `ready_to_run`), so their placeholders are still waiting on an answer.

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

  if not found
    or generation.chain_id is null
    or generation.chain_step < 1
  then
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

revoke all on function public.retire_design_screen_chain_placeholder()
  from public, anon, authenticated, service_role;
grant execute on function public.retire_design_screen_chain_placeholder()
  to service_role;

-- Named to sort after `ai_tasks_materialize_design_screen_generate`: triggers
-- on one event fire in name order, and this has to see the versions that run
-- wrote before deciding the placeholder received nothing.
create trigger ai_tasks_retire_design_screen_chain_placeholder
after update on public.ai_tasks
for each row execute function public.retire_design_screen_chain_placeholder();
