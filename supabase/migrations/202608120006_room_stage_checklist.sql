-- Manual, hand-confirmed stage-readiness items (e.g. "problem framed",
-- "design reviewed"). Auto items are derived from room signals and never stored
-- here, so this table only ever holds the handful of checks a person ticks. One
-- row per (room, item) exists exactly when that item is confirmed; clearing a
-- check deletes the row.
create table public.room_stage_checklist_items (
  room_id uuid not null references public.rooms(id) on delete cascade,
  item_key text not null,
  checked_by uuid not null references auth.users(id),
  checked_at timestamptz not null default clock_timestamp(),
  primary key (room_id, item_key)
);

alter table public.room_stage_checklist_items enable row level security;

revoke all on table public.room_stage_checklist_items from anon, authenticated;
grant select on table public.room_stage_checklist_items to authenticated;

create policy "Participants can view room checklist items"
on public.room_stage_checklist_items
for select
to authenticated
using (public.is_room_participant(room_id));

-- Toggle a manual checklist item. Guarded by can_edit_room (participant with
-- edit) — the same bar as other room writes. `checked = true` upserts the row
-- and stamps the caller; `checked = false` removes it.
create function public.set_room_checklist_item(
  target_room_id uuid,
  target_item_key text,
  target_checked boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  if not public.can_edit_room(target_room_id) then
    raise exception 'Room checklist edit access required'
      using errcode = 'P0001';
  end if;

  if target_checked then
    insert into public.room_stage_checklist_items (
      room_id, item_key, checked_by, checked_at
    )
    values (target_room_id, target_item_key, caller_id, clock_timestamp())
    on conflict (room_id, item_key) do update
      set checked_by = excluded.checked_by,
          checked_at = excluded.checked_at;
  else
    delete from public.room_stage_checklist_items
    where room_id = target_room_id
      and item_key = target_item_key;
  end if;

  return target_checked;
end;
$$;

revoke all on function public.set_room_checklist_item(uuid, text, boolean)
  from public;
grant execute on function public.set_room_checklist_item(uuid, text, boolean)
  to authenticated;

alter publication supabase_realtime
  add table public.room_stage_checklist_items;
