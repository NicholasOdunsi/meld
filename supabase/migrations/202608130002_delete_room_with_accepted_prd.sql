-- 202608030001 made an accepted PRD immutable, and its DELETE branch refuses
-- the delete outright so nobody can sidestep that immutability by erasing the
-- row and starting over. It only ever considered a PRD deleted on its own.
--
-- Deleting the Room reaches `prds` too. "Owners can delete rooms" has been in
-- place since 202607240004, and every FK into public.rooms cascades, so the
-- Room delete deletes its `prds` rows, this BEFORE DELETE trigger raises
-- `prd_accepted_immutable`, and the whole statement aborts. Accepting a PRD
-- has therefore permanently pinned its Room in place ever since: the delete
-- dialog offers to "permanently delete everything in the room" and the
-- database then refuses, with the repository reporting only its generic "We
-- could not delete the room."
--
-- Deleting a Room is a deliberate, advertised destruction of everything in it,
-- so an accepted PRD should go with it. What the guard is actually protecting
-- is an accepted version being erased out from under a Room that still exists,
-- and the two cases are distinguishable: a cascade runs as an AFTER-DELETE
-- referential action on the parent, so by the time this trigger fires the
-- Room row is already gone. Deleting the PRD directly leaves it there.
-- protect_room_owner_participant already relies on exactly this to let the
-- owner's `room_participants` row cascade away despite its own delete guard.
--
-- The UPDATE branch is unchanged.
create or replace function public.protect_accepted_prd()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'accepted'
      and exists (
        select 1 from public.rooms as room where room.id = old.room_id
      )
    then
      raise exception 'prd_accepted_immutable' using errcode = 'P0001';
    end if;
    return old;
  end if;

  if old.status = 'accepted' then
    raise exception 'prd_accepted_immutable' using errcode = 'P0001';
  end if;

  if new.status = 'accepted' then
    if old.status <> 'draft'
      or new.room_id is distinct from old.room_id
      or new.workspace_id is distinct from old.workspace_id
      or new.version is distinct from old.version
      or new.document is distinct from old.document
      or new.owner_id is distinct from old.owner_id
      or new.created_by is distinct from old.created_by
      or new.source_task_id is distinct from old.source_task_id
      or new.created_at is distinct from old.created_at
      or new.updated_at is distinct from old.updated_at
      or new.accepted_at is null
      or new.accepted_by is null
    then
      raise exception 'prd_accepted_immutable' using errcode = 'P0001';
    end if;
  elsif new.accepted_at is distinct from old.accepted_at
    or new.accepted_by is distinct from old.accepted_by
  then
    raise exception 'prd_accepted_immutable' using errcode = 'P0001';
  end if;

  return new;
end;
$$;
