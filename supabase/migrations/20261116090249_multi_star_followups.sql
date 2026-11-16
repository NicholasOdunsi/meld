-- A reply can be referenced by more than one Star. Keep the message-first
-- primary key useful for removing every reference when making its own Star.
alter table public.room_star_followups drop constraint room_star_followups_pkey;
alter table public.room_star_followups add primary key (message_id, star_task_id);

grant delete on public.room_star_followups to authenticated;
create policy "Editors can remove Star follow-ups"
on public.room_star_followups for delete to authenticated
using (public.can_edit_room(room_id));
