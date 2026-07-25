alter table public.mentions
  add column acknowledged_at timestamptz;

create index mentions_unacknowledged_idx
  on public.mentions (mentioned_user_id)
  where acknowledged_at is null;

create policy "Mentioned users can acknowledge"
on public.mentions for update to authenticated
using (mentioned_user_id = auth.uid())
with check (mentioned_user_id = auth.uid());
