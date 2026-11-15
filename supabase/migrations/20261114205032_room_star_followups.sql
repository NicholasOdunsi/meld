-- A follow-up is still a normal room message (and may create a new AI task).
-- This join keeps its relationship to the Star without changing message RPCs.
create table public.room_star_followups (
  message_id uuid primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  star_task_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (message_id, room_id) references public.messages(id, room_id) on delete cascade,
  foreign key (star_task_id, room_id) references public.ai_tasks(id, room_id) on delete cascade
);
create index room_star_followups_star_idx on public.room_star_followups (star_task_id, created_at);

alter table public.room_star_followups enable row level security;
revoke all on public.room_star_followups from anon, authenticated;
grant select, insert on public.room_star_followups to authenticated;
create policy "Participants can view Star follow-ups"
on public.room_star_followups for select to authenticated
using (public.is_room_participant(room_id));
create policy "Editors can add Star follow-ups"
on public.room_star_followups for insert to authenticated
with check (public.can_edit_room(room_id));
