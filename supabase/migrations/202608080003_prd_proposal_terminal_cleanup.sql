-- Once a newer proposal reaches a terminal user decision, older failed
-- attempts for the same section are history, not current UI state. Keeping
-- them as failed makes the document resurrect an obsolete error banner after
-- the user has accepted or discarded the current suggestion.

update public.prd_proposals as failed
set status = 'discarded',
    discarded_at = coalesce(failed.discarded_at, now()),
    updated_at = now()
where failed.status = 'failed'
  and exists (
    select 1
    from public.prd_proposals as terminal
    where terminal.room_id = failed.room_id
      and terminal.section_field = failed.section_field
      and terminal.status in ('applied', 'discarded')
      and terminal.created_at > failed.created_at
  );

create or replace function public.apply_prd_proposal(target_proposal_id uuid)
returns public.prds
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  proposal public.prd_proposals%rowtype;
  current_prd public.prds%rowtype;
  saved_prd public.prds%rowtype;
begin
  select p.* into proposal from public.prd_proposals as p
  where p.id = target_proposal_id for update;
  if proposal.id is null or caller_id is null
    or not public.can_edit_room(proposal.room_id)
    or proposal.status <> 'ready'
    or proposal.proposed_value is null
  then
    raise exception 'prd_proposal_not_ready' using errcode = 'P0001';
  end if;

  select p.* into current_prd from public.prds as p
  where p.room_id = proposal.room_id
  order by p.version desc, p.id desc limit 1 for update;
  if current_prd.version is distinct from proposal.base_version then
    raise exception 'prd_proposal_conflict' using errcode = 'P0001';
  end if;

  insert into public.prds (
    room_id, organization_id, version, status, document, owner_id, created_by
  ) values (
    current_prd.room_id, current_prd.organization_id, current_prd.version + 1,
    'draft', jsonb_set(current_prd.document,
      array[proposal.section_field], proposal.proposed_value, false),
    current_prd.owner_id, caller_id
  ) returning * into saved_prd;

  update public.prd_proposals
  set status = 'applied', applied_at = now(), updated_at = now()
  where id = proposal.id;

  update public.prd_proposals
  set status = 'discarded', discarded_at = coalesce(discarded_at, now()),
      updated_at = now()
  where room_id = proposal.room_id
    and section_field = proposal.section_field
    and status = 'failed'
    and created_at <= proposal.created_at
    and id <> proposal.id;

  return saved_prd;
end;
$$;

create or replace function public.discard_prd_proposal(target_proposal_id uuid)
returns public.prd_proposals
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  proposal public.prd_proposals%rowtype;
begin
  select p.* into proposal from public.prd_proposals as p
  where p.id = target_proposal_id for update;
  if proposal.id is null or caller_id is null
    or not public.can_edit_room(proposal.room_id)
    or proposal.status not in ('pending', 'ready')
  then
    raise exception 'prd_proposal_not_discardable' using errcode = 'P0001';
  end if;

  update public.prd_proposals
  set status = 'discarded', discarded_at = now(), updated_at = now()
  where id = proposal.id
  returning * into proposal;

  update public.prd_proposals
  set status = 'discarded', discarded_at = coalesce(discarded_at, now()),
      updated_at = now()
  where room_id = proposal.room_id
    and section_field = proposal.section_field
    and status = 'failed'
    and created_at <= proposal.created_at
    and id <> proposal.id;

  return proposal;
end;
$$;

revoke all on function public.apply_prd_proposal(uuid) from public, anon, authenticated, service_role;
grant execute on function public.apply_prd_proposal(uuid) to authenticated;
revoke all on function public.discard_prd_proposal(uuid) from public, anon, authenticated, service_role;
grant execute on function public.discard_prd_proposal(uuid) to authenticated;
