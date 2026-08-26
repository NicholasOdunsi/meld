create table public.device_pair_rate_limits (
  client_key text primary key
    check (client_key ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null,
  attempts integer not null check (attempts > 0),
  updated_at timestamptz not null
);

create index device_pair_rate_limits_window_started_at_idx
  on public.device_pair_rate_limits (window_started_at);

alter table public.device_pair_rate_limits enable row level security;

revoke all on table public.device_pair_rate_limits from public;
revoke all privileges on table public.device_pair_rate_limits
  from anon, authenticated, service_role;

create function public.consume_device_pair_attempt(target_client_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempted_at timestamptz := pg_catalog.statement_timestamp();
  current_attempts integer;
begin
  if target_client_key is null
     or target_client_key !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_client_key' using errcode = '22023';
  end if;

  -- Bound retained state without putting cleanup on a separate scheduler.
  delete from public.device_pair_rate_limits
  where window_started_at < attempted_at - interval '1 day';

  insert into public.device_pair_rate_limits (
    client_key,
    window_started_at,
    attempts,
    updated_at
  )
  values (target_client_key, attempted_at, 1, attempted_at)
  on conflict (client_key) do update
  set
    window_started_at = case
      when device_pair_rate_limits.window_started_at
        <= attempted_at - interval '10 minutes'
        then attempted_at
      else device_pair_rate_limits.window_started_at
    end,
    attempts = case
      when device_pair_rate_limits.window_started_at
        <= attempted_at - interval '10 minutes'
        then 1
      else device_pair_rate_limits.attempts + 1
    end,
    updated_at = attempted_at
  returning attempts into current_attempts;

  return current_attempts <= 10;
end;
$$;

revoke all on function public.consume_device_pair_attempt(text) from public;
revoke all on function public.consume_device_pair_attempt(text)
  from anon, authenticated, service_role;
grant execute on function public.consume_device_pair_attempt(text)
  to service_role;
