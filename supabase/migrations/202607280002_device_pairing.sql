create table public.device_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  code_hash text not null unique
    check (code_hash ~ '^[a-f0-9]{64}$'),
  requested_provider public.ai_provider not null,
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  -- No on-delete action on purpose. Devices are soft-deleted (revoked), not
  -- removed, so the audit link from a spent code to the device it minted
  -- must persist: a hard delete of a device a code produced is refused
  -- outright. `on delete set null` would instead emit an update nulling
  -- redeemed_device_id while redeemed_at stays set, which the
  -- redemption_is_paired check below rejects -- turning that delete into a
  -- confusing check violation. Deleting the owning user still cascades
  -- cleanly, since the code rows go with it.
  redeemed_device_id uuid references public.execution_devices (id),
  created_at timestamptz not null default now(),
  constraint device_pairing_codes_redemption_is_paired check (
    (redeemed_at is null) = (redeemed_device_id is null)
  )
);

create index device_pairing_codes_user_id_idx
  on public.device_pairing_codes (user_id);

alter table public.device_pairing_codes enable row level security;

-- The check constraint above makes "redeemed" and "which device it produced"
-- inseparable at the schema level, so no function can record half a
-- redemption. Nothing but a security-definer function may touch this table
-- at all: pairing codes are bearer secrets, so even a signed-in user reading
-- another row directly (rather than through auth.uid()-scoped functions)
-- would be a leak.
revoke all on table public.device_pairing_codes from public;
revoke all privileges on table public.device_pairing_codes
  from anon, authenticated, service_role;

create function public.create_device_pairing_code(
  target_code_hash text,
  target_requested_provider public.ai_provider
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  live_codes integer;
  new_expires_at timestamptz := now() + interval '10 minutes';
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = 'P0001';
  end if;

  -- The cleanup, live count, and insert are one serialized critical section
  -- per user. Transaction-scoped locking cannot leak across requests and
  -- prevents concurrent issuers from each observing four live codes.
  perform pg_advisory_xact_lock(
    hashtextextended(caller_id::text, 0)
  );

  delete from public.device_pairing_codes
  where user_id = caller_id
    and (expires_at <= now() or redeemed_at is not null);

  select count(*) into live_codes
  from public.device_pairing_codes
  where user_id = caller_id;

  if live_codes >= 5 then
    raise exception 'too_many_pairing_codes' using errcode = 'P0001';
  end if;

  insert into public.device_pairing_codes (
    user_id, code_hash, requested_provider, expires_at
  )
  values (
    caller_id, target_code_hash, target_requested_provider, new_expires_at
  );

  return new_expires_at;
end;
$$;

revoke all on function public.create_device_pairing_code(
  text, public.ai_provider
) from public;
revoke all on function public.create_device_pairing_code(
  text, public.ai_provider
) from anon, authenticated, service_role;
grant execute on function public.create_device_pairing_code(
  text, public.ai_provider
) to authenticated;

create function public.redeem_device_pairing_code(
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

  -- Unknown, expired, and already-redeemed are one error on purpose: a
  -- distinguishable response would confirm which guesses hit a real code.
  if code_row.id is null
     or code_row.expires_at <= now()
     or code_row.redeemed_at is not null then
    raise exception 'invalid_pairing_code' using errcode = 'P0001';
  end if;

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

  update public.device_pairing_codes
  set redeemed_at = now(),
      redeemed_device_id = target_device_id
  where id = code_row.id;

  return query select code_row.user_id, code_row.requested_provider;
end;
$$;

revoke all on function public.redeem_device_pairing_code(
  text, uuid, text, text, text
) from public;
revoke all on function public.redeem_device_pairing_code(
  text, uuid, text, text, text
) from anon, authenticated, service_role;
-- The public web route is the credential bootstrap. It rate-limits callers,
-- then invokes only this narrow security-definer RPC through a server-owned
-- service-role client whose key is unavailable to browsers.
grant execute on function public.redeem_device_pairing_code(
  text, uuid, text, text, text
) to service_role;

create function public.revoke_execution_device(target_device_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  update public.execution_devices
  set status = 'revoked',
      revoked_at = coalesce(revoked_at, now())
  where id = target_device_id
    and user_id = caller_id;

  if not found then
    raise exception 'invalid_execution_device' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.revoke_execution_device(uuid) from public;
revoke all on function public.revoke_execution_device(uuid)
  from anon, authenticated, service_role;
grant execute on function public.revoke_execution_device(uuid)
  to authenticated;

-- A function rather than a select-with-RLS: this runs security definer so
-- the providers aggregate can join provider_connections without relying on
-- that table's own RLS, and the explicit user_id = auth.uid() filter below
-- is what stops the join from ever exposing another user's connection rows.
create function public.list_execution_devices()
returns table (
  id uuid,
  name text,
  platform text,
  status public.execution_device_status,
  connector_version text,
  last_seen_at timestamptz,
  created_at timestamptz,
  providers jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    device.id,
    device.name,
    device.platform,
    device.status,
    device.connector_version,
    device.last_seen_at,
    device.created_at,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'provider', connection.provider,
            'installation', connection.installation,
            'version', connection.version,
            'authentication', connection.authentication,
            'compatibility', connection.compatibility,
            'lastSeenAt', connection.last_seen_at
          )
        )
        from public.provider_connections as connection
        where connection.device_id = device.id
      ),
      '[]'::jsonb
    ) as providers
  from public.execution_devices as device
  where device.user_id = auth.uid()
    and device.status = 'active'
    and device.revoked_at is null;
$$;

revoke all on function public.list_execution_devices() from public;
revoke all on function public.list_execution_devices()
  from anon, authenticated, service_role;
grant execute on function public.list_execution_devices() to authenticated;

-- Replaces the Task 4 version: it used to raise for any non-active device,
-- which left the gateway with no way to tell "unknown device" (a hard
-- failure) apart from "known but revoked" (a socket to close deliberately,
-- design §10.1). It now reports the status instead and only raises when the
-- device does not exist at all.
drop function public.record_device_connection(uuid, text);

create function public.record_device_connection(
  target_device_id uuid,
  target_connector_version text
)
returns public.execution_device_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status public.execution_device_status;
begin
  select status into current_status
  from public.execution_devices
  where id = target_device_id
  for update;

  if current_status is null then
    raise exception 'invalid_execution_device' using errcode = 'P0001';
  end if;

  -- Only an active device advances liveness; a revoked one is reported so
  -- the gateway can close its socket deliberately (design §10.1).
  if current_status = 'active' then
    update public.execution_devices
    set last_seen_at = now(),
        connector_version = left(target_connector_version, 100)
    where id = target_device_id
      and status = 'active'
      and revoked_at is null;
  end if;

  return current_status;
end;
$$;

revoke all on function public.record_device_connection(uuid, text)
  from public;
revoke all on function public.record_device_connection(uuid, text)
  from anon, authenticated, service_role;
grant execute on function public.record_device_connection(uuid, text)
  to service_role;
