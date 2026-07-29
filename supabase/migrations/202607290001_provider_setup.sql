-- Durable managed-provider setup state.
--
-- A pairing code carries the provider the user asked for, but redemption
-- previously ended at the device row: nothing recorded that a runtime and a
-- provider CLI still had to be installed and signed in, so a connector that
-- dropped mid-install left no trace to resume from and the web app had
-- nothing to render progress out of. provider_setup_requests is that record,
-- and ai_user_preferences is the "which device and provider should answer a
-- mention" choice the room needs once one setup finishes.
--
-- LOCK ORDER. Every function here takes row locks in this order, which
-- extends the order 202607280001_ai_tasks.sql and 202607280002_device_pairing
-- .sql already established rather than inventing a second one:
--
--   device_pairing_codes
--     -> execution_devices
--       -> provider_setup_requests
--         -> provider_connections
--           -> ai_user_preferences
--
-- execution_devices first is the existing invariant: claim_ai_task,
-- append_ai_task_event, settle_ai_task, acknowledge_task_cancellation,
-- hydrate_authorized_room_context, renew_ai_task_leases,
-- list_dispatchable_ai_tasks, upsert_provider_connections,
-- record_device_connection and revoke_execution_device all lock the device
-- before touching anything else, and redeem_device_pairing_code locks the
-- code before inserting the device. The ai_tasks chain that hangs off
-- execution_devices (ai_tasks -> ai_task_attempts -> ai_task_events) is
-- disjoint from the chain added here, and no function in the tree touches
-- both, so neither chain can be held while waiting on the other. Functions
-- that lock more than one row of a table order by id, matching
-- list_dispatchable_ai_tasks and renew_ai_task_leases.

create type public.provider_setup_status as enum (
  'queued', 'dispatched', 'installing', 'authenticating',
  'verifying', 'completed', 'failed', 'cancelled'
);

create type public.provider_setup_stage as enum (
  'installing', 'authenticating', 'verifying'
);

create type public.provider_setup_error_code as enum (
  'runtime_install_failed', 'provider_install_failed',
  'authentication_failed', 'verification_failed',
  'unsupported_platform', 'cancelled', 'unknown'
);

create table public.provider_setup_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  device_id uuid not null,
  provider public.ai_provider not null,
  status public.provider_setup_status not null default 'queued',
  stage public.provider_setup_stage,
  progress_message text check (
    progress_message is null or char_length(progress_message) <= 500
  ),
  error_code public.provider_setup_error_code,
  error_message text check (
    error_message is null or char_length(error_message) <= 500
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Set when the request reaches any terminal status, not only 'completed':
  -- a failed or cancelled setup needs a settlement timestamp just as much,
  -- and updated_at also moves for non-terminal progress.
  completed_at timestamptz,
  -- The composite reference is what ties a request to the same owner as its
  -- device, so a request can never outlive or drift away from the account
  -- whose credentials the connector will use.
  foreign key (device_id, user_id)
    references public.execution_devices(id, user_id) on delete cascade
);

-- One live setup per device and provider. This is the whole idempotency
-- story for repeated setup requests: create_provider_setup_request holds the
-- device row while it looks for a live request, so a second press of the
-- same button returns the first request's id instead of queueing a duplicate
-- install, and a duplicate that somehow raced past that check is refused by
-- the database rather than dispatched twice.
create unique index provider_setup_one_active
  on public.provider_setup_requests (device_id, provider)
  where status in (
    'queued', 'dispatched', 'installing', 'authenticating', 'verifying'
  );

create index provider_setup_requests_user_id_idx
  on public.provider_setup_requests (user_id);

create table public.ai_user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_device_id uuid,
  default_provider public.ai_provider,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- "Half a default" is unusable: a device with no provider or a provider
  -- with no device would still read as configured to every caller.
  check (
    (default_device_id is null and default_provider is null)
    or (default_device_id is not null and default_provider is not null)
  ),
  foreign key (default_device_id, user_id)
    references public.execution_devices(id, user_id)
);

create function public.create_provider_setup_request(
  target_device_id uuid,
  target_provider public.ai_provider
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  locked_device public.execution_devices%rowtype;
  current_request public.provider_setup_requests%rowtype;
begin
  if caller_id is null then
    raise exception 'invalid_provider_setup_request' using errcode = 'P0001';
  end if;

  -- The device lock is both the ownership check and the serializer: it is
  -- taken before the live-request lookup so two concurrent presses of the
  -- same button cannot both observe "no live request" and insert.
  select device.*
  into locked_device
  from public.execution_devices as device
  where device.id = target_device_id
    and device.user_id = caller_id
  for update;

  -- Unknown, someone else's, and revoked are deliberately one error: a
  -- caller probing device ids must not learn which of the three it hit.
  if locked_device.id is null
    or locked_device.status <> 'active'
    or locked_device.revoked_at is not null
  then
    raise exception 'invalid_provider_setup_request' using errcode = 'P0001';
  end if;

  select request.*
  into current_request
  from public.provider_setup_requests as request
  where request.device_id = target_device_id
    and request.provider = target_provider
    and request.status in (
      'queued', 'dispatched', 'installing', 'authenticating', 'verifying'
    )
  for update;

  if current_request.id is null then
    insert into public.provider_setup_requests (
      user_id, device_id, provider
    )
    values (caller_id, target_device_id, target_provider)
    returning * into current_request;
  end if;

  return jsonb_build_object(
    'id', current_request.id,
    'userId', current_request.user_id,
    'deviceId', current_request.device_id,
    'provider', current_request.provider,
    'status', current_request.status,
    'stage', current_request.stage,
    'progressMessage', current_request.progress_message,
    'errorCode', current_request.error_code,
    'errorMessage', current_request.error_message,
    'createdAt', current_request.created_at,
    'updatedAt', current_request.updated_at,
    'completedAt', current_request.completed_at
  );
end;
$$;

revoke all on function public.create_provider_setup_request(
  uuid, public.ai_provider
) from public;
revoke all on function public.create_provider_setup_request(
  uuid, public.ai_provider
) from anon, authenticated, service_role;
grant execute on function public.create_provider_setup_request(
  uuid, public.ai_provider
) to authenticated;

-- Returns every nonterminal request for a connected device, not only the
-- queued ones: a connector that reconnects mid-install must be told to
-- resume, and the connector's own steps are idempotent, so redispatching a
-- request that is already 'authenticating' costs nothing. Only 'queued' rows
-- advance to 'dispatched' -- rewriting a later stage back to 'dispatched'
-- would lose the progress the web app is rendering.
create function public.list_dispatchable_provider_setups(
  connected_device_ids uuid[]
)
returns table (
  request_id uuid,
  device_id uuid,
  provider public.ai_provider
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  connected_devices uuid[];
begin
  select coalesce(
    array_agg(distinct connected.connected_id),
    '{}'::uuid[]
  )
  into connected_devices
  from unnest(
    coalesce(connected_device_ids, '{}'::uuid[])
  ) as connected(connected_id);

  perform device.id
  from public.execution_devices as device
  where device.id = any(connected_devices)
  order by device.id
  for update;

  -- A socket the gateway still holds open for a device revoked since it
  -- connected must dispatch nothing, so liveness is re-read under the lock
  -- rather than trusted from the caller's list.
  select coalesce(
    array_agg(device.id order by device.id),
    '{}'::uuid[]
  )
  into connected_devices
  from public.execution_devices as device
  where device.id = any(connected_devices)
    and device.status = 'active'
    and device.revoked_at is null;

  with locked_requests as materialized (
    select request.id
    from public.provider_setup_requests as request
    where request.device_id = any(connected_devices)
      and request.status in (
        'queued', 'dispatched', 'installing', 'authenticating', 'verifying'
      )
    order by request.id
    for update
  )
  update public.provider_setup_requests as request
  set status = 'dispatched',
      updated_at = now()
  from locked_requests
  where request.id = locked_requests.id
    and request.status = 'queued';

  return query
  select request.id, request.device_id, request.provider
  from public.provider_setup_requests as request
  where request.device_id = any(connected_devices)
    and request.status in (
      'dispatched', 'installing', 'authenticating', 'verifying'
    )
  order by request.id;
end;
$$;

revoke all on function public.list_dispatchable_provider_setups(uuid[])
  from public;
revoke all on function public.list_dispatchable_provider_setups(uuid[])
  from anon, authenticated, service_role;
grant execute on function public.list_dispatchable_provider_setups(uuid[])
  to service_role;

create function public.record_provider_setup_progress(
  target_request_id uuid,
  target_device_id uuid,
  target_stage public.provider_setup_stage,
  target_message text
)
returns public.provider_setup_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_device_id uuid;
  current_request public.provider_setup_requests%rowtype;
  next_status public.provider_setup_status;
begin
  select device.id
  into active_device_id
  from public.execution_devices as device
  where device.id = target_device_id
    and device.status = 'active'
    and device.revoked_at is null
  for update;

  select request.*
  into current_request
  from public.provider_setup_requests as request
  where request.id = target_request_id
  for update;

  -- The request names the only device allowed to report on it: a second
  -- connector on the same account must not be able to drive someone else's
  -- install forward.
  if active_device_id is null
    or current_request.id is null
    or current_request.device_id <> target_device_id
  then
    raise exception 'invalid_provider_setup_progress' using errcode = 'P0001';
  end if;

  -- The three stage members are also status members, so status and stage
  -- move together and no separate mapping table is needed.
  next_status := target_stage::text::public.provider_setup_status;

  -- Resending the current stage is a success, not a conflict: a reconnect
  -- redispatches a request the connector is already working on, and it will
  -- announce the stage it is on before doing anything else.
  if current_request.status = next_status then
    update public.provider_setup_requests
    set progress_message = left(target_message, 500),
        updated_at = now()
    where id = current_request.id;

    return current_request.status;
  end if;

  -- dispatched -> installing -> authenticating -> verifying, one step at a
  -- time. A skip would let a failed stage pass as done, and a rewind would
  -- let a stale retry overwrite live progress.
  if not (
    (current_request.status = 'dispatched' and target_stage = 'installing')
    or (
      current_request.status = 'installing'
      and target_stage = 'authenticating'
    )
    or (
      current_request.status = 'authenticating'
      and target_stage = 'verifying'
    )
  ) then
    raise exception 'invalid_provider_setup_progress' using errcode = 'P0001';
  end if;

  update public.provider_setup_requests
  set status = next_status,
      stage = target_stage,
      progress_message = left(target_message, 500),
      updated_at = now()
  where id = current_request.id;

  return next_status;
end;
$$;

revoke all on function public.record_provider_setup_progress(
  uuid, uuid, public.provider_setup_stage, text
) from public;
revoke all on function public.record_provider_setup_progress(
  uuid, uuid, public.provider_setup_stage, text
) from anon, authenticated, service_role;
grant execute on function public.record_provider_setup_progress(
  uuid, uuid, public.provider_setup_stage, text
) to service_role;

create function public.settle_provider_setup_request(
  target_request_id uuid,
  target_device_id uuid,
  target_success boolean,
  target_provider_status jsonb,
  target_error_code public.provider_setup_error_code,
  target_error_message text
)
returns public.provider_setup_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_device_id uuid;
  current_request public.provider_setup_requests%rowtype;
  target_status public.provider_setup_status;
  settled_code public.provider_setup_error_code;
  settled_message text;
begin
  select device.id
  into active_device_id
  from public.execution_devices as device
  where device.id = target_device_id
    and device.status = 'active'
    and device.revoked_at is null
  for update;

  select request.*
  into current_request
  from public.provider_setup_requests as request
  where request.id = target_request_id
  for update;

  if active_device_id is null
    or current_request.id is null
    or current_request.device_id <> target_device_id
  then
    raise exception 'invalid_provider_setup_settlement'
      using errcode = 'P0001';
  end if;

  if target_success then
    target_status := 'completed';
    settled_code := null;
    settled_message := null;
  elsif target_error_code is null then
    -- A failure with no code would settle the request into a state the web
    -- app cannot explain and the connector cannot retry from.
    raise exception 'invalid_provider_setup_settlement'
      using errcode = 'P0001';
  else
    settled_code := target_error_code;
    settled_message := left(target_error_message, 500);
    target_status := (
      case when target_error_code = 'cancelled' then 'cancelled'
      else 'failed' end
    )::public.provider_setup_status;
  end if;

  -- One terminal result per request. There is no settlement fingerprint
  -- column, and none is needed: the terminal status plus the error code and
  -- message are the whole result, so comparing them tells a retried delivery
  -- apart from a contradictory second settlement.
  if current_request.status in ('completed', 'failed', 'cancelled') then
    if current_request.status = target_status
      and current_request.error_code is not distinct from settled_code
      and current_request.error_message is not distinct from settled_message
    then
      return current_request.status;
    end if;

    raise exception 'conflicting_provider_setup_settlement'
      using errcode = 'P0001';
  end if;

  if target_success then
    -- Completion means "this provider can run a task now". Anything short of
    -- installed, authenticated and supported would mark setup done and then
    -- fail the first mention, so it is refused here rather than stored.
    if target_provider_status is null
      or jsonb_typeof(target_provider_status) <> 'object'
      or target_provider_status ->> 'provider'
        is distinct from current_request.provider::text
      or target_provider_status ->> 'installation' <> 'installed'
      or target_provider_status ->> 'authentication' <> 'authenticated'
      or target_provider_status ->> 'compatibility' <> 'supported'
    then
      raise exception 'invalid_provider_setup_settlement'
        using errcode = 'P0001';
    end if;

    -- Reuses the existing upsert rather than writing provider_connections
    -- directly, so the connection this records is validated and shaped
    -- exactly like the ones a heartbeat records.
    perform public.upsert_provider_connections(
      target_device_id,
      jsonb_build_array(target_provider_status)
    );
  end if;

  update public.provider_setup_requests
  set status = target_status,
      error_code = settled_code,
      error_message = settled_message,
      completed_at = now(),
      updated_at = now()
  where id = current_request.id;

  if target_success then
    -- The first ready connection becomes the default so a brand-new user
    -- never has to choose before their first mention works, and a later
    -- completion must not silently move a default the user has since set for
    -- themselves.
    --
    -- The conflict target is the row, but the invariant is the *default*, so
    -- the WHERE tests the column rather than relying on the row's absence.
    -- Plain DO NOTHING conflated the two: revocation clears a default in
    -- place (the DDL makes both columns nullable behind a both-or-neither
    -- check precisely so it can), so the row outlives the default it held.
    -- After revoking laptop A and pairing laptop B, DO NOTHING would fire
    -- against that surviving cleared row and leave the user with no default
    -- forever -- in the re-pair flow this feature exists for.
    insert into public.ai_user_preferences (
      user_id, default_device_id, default_provider
    )
    values (
      current_request.user_id, target_device_id, current_request.provider
    )
    on conflict (user_id) do update
    set default_device_id = excluded.default_device_id,
        default_provider = excluded.default_provider,
        updated_at = now()
    where public.ai_user_preferences.default_device_id is null;
  end if;

  return target_status;
end;
$$;

revoke all on function public.settle_provider_setup_request(
  uuid, uuid, boolean, jsonb, public.provider_setup_error_code, text
) from public;
revoke all on function public.settle_provider_setup_request(
  uuid, uuid, boolean, jsonb, public.provider_setup_error_code, text
) from anon, authenticated, service_role;
grant execute on function public.settle_provider_setup_request(
  uuid, uuid, boolean, jsonb, public.provider_setup_error_code, text
) to service_role;

create function public.set_ai_user_preference(
  target_device_id uuid,
  target_provider public.ai_provider
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  locked_device public.execution_devices%rowtype;
  saved_preference public.ai_user_preferences%rowtype;
begin
  if caller_id is null then
    raise exception 'invalid_ai_user_preference' using errcode = 'P0001';
  end if;

  select device.*
  into locked_device
  from public.execution_devices as device
  where device.id = target_device_id
    and device.user_id = caller_id
  for update;

  if locked_device.id is null
    or locked_device.status <> 'active'
    or locked_device.revoked_at is not null
  then
    raise exception 'invalid_ai_user_preference' using errcode = 'P0001';
  end if;

  -- Only a provider that is installed, signed in and supported may be
  -- stored: a default that cannot run is indistinguishable from no default
  -- at the point of use, but far more confusing to the user.
  if not exists (
    select 1
    from public.provider_connections as connection
    where connection.device_id = target_device_id
      and connection.user_id = caller_id
      and connection.provider = target_provider
      and connection.installation = 'installed'
      and connection.authentication = 'authenticated'
      and connection.compatibility = 'supported'
  ) then
    raise exception 'invalid_ai_user_preference' using errcode = 'P0001';
  end if;

  insert into public.ai_user_preferences (
    user_id, default_device_id, default_provider
  )
  values (caller_id, target_device_id, target_provider)
  on conflict (user_id) do update
  set default_device_id = excluded.default_device_id,
      default_provider = excluded.default_provider,
      updated_at = now()
  returning * into saved_preference;

  return jsonb_build_object(
    'userId', saved_preference.user_id,
    'defaultDeviceId', saved_preference.default_device_id,
    'defaultProvider', saved_preference.default_provider,
    'createdAt', saved_preference.created_at,
    'updatedAt', saved_preference.updated_at
  );
end;
$$;

revoke all on function public.set_ai_user_preference(
  uuid, public.ai_provider
) from public;
revoke all on function public.set_ai_user_preference(
  uuid, public.ai_provider
) from anon, authenticated, service_role;
grant execute on function public.set_ai_user_preference(
  uuid, public.ai_provider
) to authenticated;

-- Replaces the 202607280002_device_pairing.sql version at the same
-- signature. Everything that version guaranteed is preserved verbatim -- the
-- code row is locked FOR UPDATE, unknown/expired/already-redeemed remain a
-- single indistinguishable error, the device's owner still comes only from
-- the redeemed row and never from a caller-supplied value, and the spend
-- write-back still happens in the same transaction. The only addition is the
-- queued setup request, which belongs here rather than in a follow-up call:
-- a device that exists with nothing telling the connector to install its
-- provider is a paired machine that silently never becomes usable.
drop function public.redeem_device_pairing_code(
  text, uuid, text, text, text
);

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

-- Replaces the 202607280002_device_pairing.sql version at the same
-- signature. The original guards are preserved: auth.uid() scoping so one
-- user cannot revoke another's device, the FOR UPDATE that serializes
-- concurrent revocations, and coalesce(revoked_at, now()) so a repeat
-- revocation keeps the original timestamp instead of sliding it forward.
drop function public.revoke_execution_device(uuid);

create function public.revoke_execution_device(target_device_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  current_device public.execution_devices%rowtype;
begin
  select device.*
  into current_device
  from public.execution_devices as device
  where device.id = target_device_id
    and device.user_id = caller_id
  for update;

  if current_device.id is null then
    raise exception 'invalid_execution_device' using errcode = 'P0001';
  end if;

  update public.execution_devices
  set status = 'revoked',
      revoked_at = coalesce(revoked_at, now())
  where id = current_device.id
    and user_id = current_device.user_id;

  -- A revoked device can never finish its setup, so its live requests are
  -- closed here. Left open they would keep the one-active index occupied,
  -- blocking a fresh request on a replacement device, and every reconnect
  -- sweep would keep listing them as dispatchable.
  update public.provider_setup_requests
  set status = 'cancelled',
      error_code = 'cancelled',
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
  where device_id = current_device.id
    and status in (
      'queued', 'dispatched', 'installing', 'authenticating', 'verifying'
    );

  -- Cleared rather than deleted: the row is the user's preference record, so
  -- it keeps its created_at and its identity while losing a default that now
  -- points at hardware the user has just disowned. The check constraint
  -- forces both columns to clear together. settle_provider_setup_request
  -- refills a cleared default rather than skipping on row conflict, so a
  -- replacement device can become the default again.
  update public.ai_user_preferences
  set default_device_id = null,
      default_provider = null,
      updated_at = now()
  where user_id = current_device.user_id
    and default_device_id = current_device.id;
end;
$$;

revoke all on function public.revoke_execution_device(uuid) from public;
revoke all on function public.revoke_execution_device(uuid)
  from anon, authenticated, service_role;
grant execute on function public.revoke_execution_device(uuid)
  to authenticated;

alter table public.provider_setup_requests enable row level security;
alter table public.ai_user_preferences enable row level security;

-- Every write goes through the RPCs above, which is what makes the status
-- machine, the assigned-device check and the one-terminal-settlement rule
-- enforceable at all. Direct SELECT stays available to authenticated so the
-- setup screen can subscribe to its own rows through Realtime; anon holds
-- nothing at all.
revoke all on table public.provider_setup_requests from anon;
revoke all on table public.ai_user_preferences from anon;

revoke all privileges
  on table public.provider_setup_requests,
  public.ai_user_preferences
  from authenticated, service_role;

grant select
  on table public.provider_setup_requests,
  public.ai_user_preferences
  to authenticated, service_role;

create policy "Users can view their provider setup requests"
on public.provider_setup_requests
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can view their AI preferences"
on public.ai_user_preferences
for select
to authenticated
using (user_id = auth.uid());
