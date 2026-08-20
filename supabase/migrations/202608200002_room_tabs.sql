-- Tabs are the Room's workstreams. Each holds an ordered list of tools and
-- nothing positional: geometry is derived from the list's length and each
-- tool's index (see apps/web/src/features/rooms/pane-layout.ts), so a layout
-- needs no stored sizes and survives any viewport.
--
-- Row-per-tab rather than a jsonb blob on `rooms`, because two people editing
-- different tabs must not clobber each other. It also gives per-row Realtime
-- for free.
--
-- The generated Overview tab has NO row. It is computed at read time from the
-- Room's artifacts, the way the deck computes STALE.
--
-- Postgres refuses a subquery written directly inside a CHECK constraint, so
-- the pane-shape rule is a function instead, the same way
-- ai_message_text_array_ok backs the assumptions/suggested_next_questions
-- bounds on messages. At most 4 entries, every entry one of the three known
-- tools, no tool repeated within a tab.
create function public.room_tabs_panes_ok(target_panes jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(target_panes) = 'array'
    and jsonb_array_length(target_panes) <= 4
    and not exists (
      select 1
      from jsonb_array_elements_text(target_panes) as pane(tool)
      where pane.tool not in ('canvas', 'prototype', 'prd')
    )
    and (
      select count(distinct pane.tool) = jsonb_array_length(target_panes)
      from jsonb_array_elements_text(target_panes) as pane(tool)
    );
$$;

create table public.room_tabs (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms(id) on delete cascade,
  name        text,
  position    integer not null,
  panes       jsonb not null default '[]'::jsonb,
  created_by  uuid not null references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- `name` is nullable on purpose: a new tab is untitled until the work names
  -- it. An explicitly blank name is a bug, not an untitled tab.
  constraint room_tabs_name_not_blank
    check (name is null or char_length(btrim(name)) between 1 and 80),

  -- Four is the most a tab holds. `insertPaneAt` clamps politely; this is the
  -- honest guard.
  constraint room_tabs_panes_shape check (public.room_tabs_panes_ok(panes))
);

create index room_tabs_room_position on public.room_tabs (room_id, position);

alter table public.room_tabs enable row level security;

revoke all on table public.room_tabs from anon, authenticated;
grant select, insert, update, delete on table public.room_tabs to authenticated;

-- Reading mirrors Room visibility: any participant sees every tab. A
-- view-only participant can switch between tabs; they cannot change them.
create policy "Participants can view room tabs"
on public.room_tabs
for select
to authenticated
using (public.is_room_participant(room_id));

-- Writing mirrors exactly what the database already enforces for other Room
-- writes: can_edit_room, which is participant-with-edit and nothing else --
-- no Room owner bypass and no Workspace administrator bypass.
create policy "Editors can create room tabs"
on public.room_tabs
for insert
to authenticated
with check (public.can_edit_room(room_id) and created_by = auth.uid());

create policy "Editors can change room tabs"
on public.room_tabs
for update
to authenticated
using (public.can_edit_room(room_id))
with check (public.can_edit_room(room_id));

create policy "Editors can close room tabs"
on public.room_tabs
for delete
to authenticated
using (public.can_edit_room(room_id));

-- Backfill: every Room already in the database gets one untitled, empty tab.
-- Existing artifacts are deliberately NOT converted into panes -- opening an
-- old Room gives you the empty plane and you place what you want, which is
-- the entire point of the rebuild. Nothing is lost; the PRD, canvas and
-- prototype are one tap away.
insert into public.room_tabs (room_id, name, position, panes, created_by)
select room.id, null, 0, '[]'::jsonb, room.owner_id
from public.rooms as room;

-- New Rooms get their first tab in the same transaction as the Room, so a
-- Room can never exist without one.
create function public.add_room_first_tab()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.room_tabs (room_id, name, position, panes, created_by)
  values (new.id, null, 0, '[]'::jsonb, new.owner_id);
  return new;
end;
$$;

revoke all on function public.add_room_first_tab() from public, anon, authenticated;

create trigger room_first_tab
after insert on public.rooms
for each row
execute function public.add_room_first_tab();

-- Realtime: a tab another participant adds, renames, reorders or re-lays-out
-- must appear without a reload.
alter publication supabase_realtime add table public.room_tabs;
