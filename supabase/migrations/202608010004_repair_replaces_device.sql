-- Single-Mac model: pairing a new device replaces the one the user already has.
-- redeem now revokes the user's prior active device(s) before inserting the new
-- one, which clears the stale default so settle_provider_setup_request refills it
-- to the new device. Without this, a re-pair left the default pointed at a device
-- the connector had already abandoned, and every room-reply task pinned to it hung
-- at 'waiting_for_device' forever.
create or replace function public.redeem_device_pairing_code(
  target_code_hash text,
  target_device_id uuid,
  target_token_hash text,
  target_platform text,
  target_name text
)
returns table (user_id uuid, requested_provider public.ai_provider)
language plpgsql
security definer
set search_path = ''
as $$
declare
  code_row public.device_pairing_codes;
begin
  select * into code_row
  from public.device_pairing_codes as code
  where code.code_hash = target_code_hash
  for update;

  if code_row.id is null
     or code_row.expires_at <= now()
     or code_row.redeemed_at is not null then
    raise exception 'invalid_pairing_code' using errcode = 'P0001';
  end if;

  -- Replace any device the user already has. The connector overwrites its stored
  -- credential on pair and reconnects as the new device, so prior devices are
  -- abandoned the instant this runs. Mirrors revoke_execution_device inline (we
  -- cannot call it: it keys on auth.uid() and this runs credential-less).
  -- Columns are aliased and qualified throughout: this function's OUT columns
  -- are named user_id/requested_provider, so a bare `user_id` in a WHERE clause
  -- is ambiguous against that variable.
  update public.execution_devices as device
  set status = 'revoked',
      revoked_at = coalesce(device.revoked_at, now())
  where device.user_id = code_row.user_id
    and device.status = 'active'
    and device.revoked_at is null;

  update public.provider_setup_requests as request
  set status = 'cancelled',
      error_code = 'cancelled',
      completed_at = coalesce(request.completed_at, now()),
      updated_at = now()
  where request.user_id = code_row.user_id
    and request.status in (
      'queued', 'dispatched', 'installing', 'authenticating', 'verifying'
    );

  -- A valid default always references an active device, so it pointed at one we
  -- just revoked. Clear both columns together for the both-or-neither check;
  -- settle refills them when the new device finishes setup.
  update public.ai_user_preferences as preference
  set default_device_id = null,
      default_provider = null,
      updated_at = now()
  where preference.user_id = code_row.user_id
    and preference.default_device_id is not null;

  -- The device's owner comes only from the redeemed row, never from a
  -- caller-supplied value: the caller here has no Supabase session at all,
  -- so nothing it sends can be trusted to name whose account it joins.
  insert into public.execution_devices (
    id, user_id, name, platform, token_hash, status
  )
  values (
    target_device_id,
    code_row.user_id,
    left(coalesce(nullif(target_name, ''), 'Meld connector'), 100),
    left(target_platform, 50),
    target_token_hash,
    'active'
  );

  insert into public.provider_setup_requests (
    user_id, device_id, provider
  )
  values (
    code_row.user_id,
    target_device_id,
    code_row.requested_provider
  );

  update public.device_pairing_codes
  set redeemed_at = now(),
      redeemed_device_id = target_device_id
  where id = code_row.id;

  return query select code_row.user_id, code_row.requested_provider;
end;
$$;
