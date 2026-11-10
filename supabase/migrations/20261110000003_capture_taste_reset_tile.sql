-- Clear a single tile lock so Orion can reconsider that tile on a later refresh.
-- Spec B3 queues a rethink; this plan only clears the lock (refresh still waits
-- for enough new saves).

create function public.capture_clear_taste_lock(actor_user_id uuid, target_workspace_id uuid, lock_tile text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.inspiration_actor_is_member(actor_user_id, target_workspace_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if lock_tile not in ('designLanguage','colors','typography','spacing','density','layoutHabits','signatureDetails','avoid') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  update public.taste_profiles set locks = locks - lock_tile, updated_at = now()
    where workspace_id = target_workspace_id and user_id = actor_user_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.capture_clear_taste_lock(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.capture_clear_taste_lock(uuid, uuid, text) to service_role;
