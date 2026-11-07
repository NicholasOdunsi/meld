-- DeepSeek is an API-key provider for local Orion runs (taste-test screen
-- generation). It is reported by the connector when DEEPSEEK_API_KEY is set;
-- there is no managed CLI install/login.

alter type public.ai_provider add value if not exists 'deepseek';

create or replace function public.upsert_provider_connections(
  target_device_id uuid,
  target_statuses jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
begin
  select device.user_id
  into target_user_id
  from public.execution_devices as device
  where device.id = target_device_id
    and device.status = 'active'
    and device.revoked_at is null
  for update;

  if target_user_id is null
    or target_statuses is null
    or jsonb_typeof(target_statuses) <> 'array'
    or jsonb_array_length(target_statuses) > 3
  then
    raise exception 'invalid_provider_connections' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(target_statuses) as item
    where jsonb_typeof(item) <> 'object'
      or item ->> 'provider' is null
      or item ->> 'installation' is null
      or not item ? 'version'
      or item ->> 'authentication' is null
      or item ->> 'compatibility' is null
      or item ->> 'provider' not in ('codex', 'claude', 'deepseek')
      or item ->> 'installation' not in (
        'not_installed', 'installing', 'installed',
        'update_required', 'failed'
      )
      or item ->> 'authentication' not in (
        'authenticated', 'signed_out', 'unknown'
      )
      or item ->> 'compatibility' not in (
        'supported', 'outdated', 'unavailable'
      )
      or (item ? 'models' and jsonb_typeof(item -> 'models') <> 'array')
      or (item ? 'defaultModel' and jsonb_typeof(item -> 'defaultModel') <> 'string')
  )
  or (
    select count(*) <> count(distinct item ->> 'provider')
    from jsonb_array_elements(target_statuses) as item
  )
  then
    raise exception 'invalid_provider_connections' using errcode = 'P0001';
  end if;

  insert into public.provider_connections (
    user_id,
    device_id,
    provider,
    installation,
    version,
    models,
    default_model,
    authentication,
    compatibility,
    last_seen_at
  )
  select
    target_user_id,
    target_device_id,
    (item ->> 'provider')::public.ai_provider,
    (item ->> 'installation')::public.provider_installation_status,
    item ->> 'version',
    coalesce(item -> 'models', '[]'::jsonb),
    item ->> 'defaultModel',
    (item ->> 'authentication')::public.provider_authentication_status,
    (item ->> 'compatibility')::public.provider_compatibility_status,
    now()
  from jsonb_array_elements(target_statuses) as item
  on conflict (device_id, provider) do update
  set provider = excluded.provider,
      installation = excluded.installation,
      version = excluded.version,
      models = excluded.models,
      default_model = excluded.default_model,
      authentication = excluded.authentication,
      compatibility = excluded.compatibility,
      last_seen_at = excluded.last_seen_at;
end;
$$;
