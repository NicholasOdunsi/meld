-- Orion Step 1: Inspiration Library + Mac Shelf.
-- Spec: docs/superpowers/specs/2026-11-06-inspiration-library-and-shelf-design.md (Part D)
-- Writes go only through the security-definer functions below. Each public
-- RPC has a session flavour (actor = auth.uid()) and, where the shelf needs
-- it, a service-role "capture_" flavour that names the actor explicitly.

create table public.inspiration_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'ready', 'failed')),
  storage_path text not null unique,
  mime_type text not null
    check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  byte_size integer not null check (byte_size between 1 and 10485760),
  width integer not null check (width between 1 and 4096),
  height integer not null check (height between 1 and 4096),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  source_url text check (source_url is null or char_length(source_url) <= 2048),
  note text check (note is null or char_length(note) <= 500),
  capture_channel text not null check (capture_channel in ('shelf', 'web')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, content_hash)
);
create index inspiration_items_workspace_created
  on public.inspiration_items (workspace_id, created_at desc);

create table public.room_inspiration (
  room_id uuid not null references public.rooms(id) on delete cascade,
  item_id uuid not null references public.inspiration_items(id) on delete cascade,
  added_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (room_id, item_id)
);
create index room_inspiration_item on public.room_inspiration (item_id);

create table public.capture_connect_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  code_hash text not null unique check (code_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);
create index capture_connect_codes_user on public.capture_connect_codes (user_id);

create table public.capture_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  device_name text not null check (char_length(device_name) between 1 and 100),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index capture_tokens_one_active
  on public.capture_tokens (user_id, workspace_id) where revoked_at is null;

-- RLS: reads for members, no direct writes for anyone.
alter table public.inspiration_items enable row level security;
alter table public.room_inspiration enable row level security;
alter table public.capture_connect_codes enable row level security;
alter table public.capture_tokens enable row level security;

revoke all on table public.inspiration_items from anon, authenticated;
revoke all on table public.room_inspiration from anon, authenticated;
revoke all on table public.capture_connect_codes from anon, authenticated;
revoke all on table public.capture_tokens from anon, authenticated;

grant select on table public.inspiration_items to authenticated;
create policy "Workspace members can view inspiration"
on public.inspiration_items for select to authenticated
using (public.is_workspace_member(workspace_id));

grant select on table public.room_inspiration to authenticated;
create policy "Room participants can view room inspiration"
on public.room_inspiration for select to authenticated
using (public.is_room_participant(room_id));

-- Column grant: the Settings page lists tokens but must never see token_hash.
grant select (id, user_id, workspace_id, device_name, last_used_at, revoked_at, created_at)
  on table public.capture_tokens to authenticated;
create policy "Owners can view their shelf tokens"
on public.capture_tokens for select to authenticated
using (user_id = auth.uid());

-- Internal helpers (actor-explicit so the service-role path, where auth.uid()
-- is null, uses the same checks as the session path).
create function public.inspiration_actor_is_member(actor uuid, target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where workspace_id = target_workspace_id and user_id = actor
  );
$$;

create function public.inspiration_actor_can_edit_room(actor uuid, target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.room_participants
    where room_id = target_room_id and user_id = actor and access = 'edit'
  );
$$;

create function public.inspiration_intent_for(
  actor uuid,
  target_workspace_id uuid,
  item_hash text,
  item_mime text,
  item_size integer,
  item_width integer,
  item_height integer,
  item_source_url text,
  item_note text,
  item_channel text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.inspiration_items;
  saved public.inspiration_items;
  new_id uuid := gen_random_uuid();
  extension text;
  cleaned_note text := nullif(btrim(coalesce(item_note, '')), '');
begin
  if actor is null
    or not public.inspiration_actor_is_member(actor, target_workspace_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  extension := case item_mime
    when 'image/png' then 'png'
    when 'image/jpeg' then 'jpg'
    when 'image/webp' then 'webp'
  end;
  if extension is null then
    raise exception 'unsupported_type' using errcode = 'P0001';
  end if;

  select * into existing
  from public.inspiration_items
  where workspace_id = target_workspace_id and content_hash = item_hash
  for update;

  if found and existing.status = 'ready' then
    if cleaned_note is not null then
      update public.inspiration_items
      set note = cleaned_note, updated_at = now()
      where id = existing.id
      returning * into existing;
    end if;
    return jsonb_build_object('item', to_jsonb(existing), 'duplicate', true);
  end if;

  if found then
    -- An earlier attempt never finished uploading. Reuse its row and path so
    -- the caller simply uploads again. Keep the prior note when the retry
    -- omits one (same rule as the ready-duplicate path above).
    update public.inspiration_items
    set status = 'pending',
        created_by = actor,
        source_url = item_source_url,
        note = coalesce(cleaned_note, note),
        capture_channel = item_channel,
        updated_at = now()
    where id = existing.id
    returning * into saved;
    return jsonb_build_object('item', to_jsonb(saved), 'duplicate', false);
  end if;

  insert into public.inspiration_items (
    id, workspace_id, created_by, status, storage_path, mime_type, byte_size,
    width, height, content_hash, source_url, note, capture_channel
  ) values (
    new_id, target_workspace_id, actor, 'pending',
    target_workspace_id::text || '/' || new_id::text || '.' || extension,
    item_mime, item_size, item_width, item_height, item_hash,
    item_source_url, cleaned_note, item_channel
  )
  returning * into saved;
  return jsonb_build_object('item', to_jsonb(saved), 'duplicate', false);
end;
$$;

create function public.inspiration_settle_for(actor uuid, target_item_id uuid, next_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if next_status not in ('ready', 'failed') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  update public.inspiration_items
  set status = next_status, updated_at = now()
  where id = target_item_id and created_by = actor and status = 'pending';
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end;
$$;

create function public.inspiration_link_for(actor uuid, target_room_id uuid, target_item_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  room_workspace uuid;
  inserted integer;
begin
  if coalesce(cardinality(target_item_ids), 0) not between 1 and 100 then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if actor is null or not public.inspiration_actor_can_edit_room(actor, target_room_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  select workspace_id into room_workspace from public.rooms where id = target_room_id;
  if exists (
    select 1
    from unnest(target_item_ids) as wanted(id)
    left join public.inspiration_items item on item.id = wanted.id
    where item.id is null or item.status <> 'ready' or item.workspace_id <> room_workspace
  ) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  insert into public.room_inspiration (room_id, item_id, added_by)
  select target_room_id, wanted.id, actor from unnest(target_item_ids) as wanted(id)
  on conflict (room_id, item_id) do nothing;
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

revoke all on function public.inspiration_actor_is_member(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.inspiration_actor_can_edit_room(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.inspiration_intent_for(uuid, uuid, text, text, integer, integer, integer, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.inspiration_settle_for(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.inspiration_link_for(uuid, uuid, uuid[]) from public, anon, authenticated, service_role;

-- Session RPCs (browser, actor = auth.uid()).
create function public.create_inspiration_intent(
  target_workspace_id uuid, item_hash text, item_mime text, item_size integer,
  item_width integer, item_height integer, item_source_url text, item_note text, item_channel text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.inspiration_intent_for(auth.uid(), target_workspace_id, item_hash, item_mime,
    item_size, item_width, item_height, item_source_url, item_note, item_channel);
$$;

create function public.finalize_inspiration_item(target_item_id uuid)
returns void language sql security definer set search_path = ''
as $$ select public.inspiration_settle_for(auth.uid(), target_item_id, 'ready'); $$;

create function public.fail_inspiration_item(target_item_id uuid)
returns void language sql security definer set search_path = ''
as $$ select public.inspiration_settle_for(auth.uid(), target_item_id, 'failed'); $$;

create function public.update_inspiration_note(target_item_id uuid, item_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if char_length(coalesce(item_note, '')) > 500 then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  update public.inspiration_items
  set note = nullif(btrim(coalesce(item_note, '')), ''), updated_at = now()
  where id = target_item_id
    and status = 'ready'
    and public.inspiration_actor_is_member(auth.uid(), workspace_id);
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end;
$$;

create function public.delete_inspiration_items(target_item_ids uuid[])
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  paths text[];
begin
  if coalesce(cardinality(target_item_ids), 0) not between 1 and 100 then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from unnest(target_item_ids) as wanted(id)
    left join public.inspiration_items item on item.id = wanted.id
    where item.id is null
      or not public.inspiration_actor_is_member(auth.uid(), item.workspace_id)
  ) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  with removed as (
    delete from public.inspiration_items
    where id = any(target_item_ids)
    returning storage_path
  )
  select coalesce(array_agg(storage_path), '{}') into paths from removed;
  return paths;
end;
$$;

create function public.link_inspiration_to_room(target_room_id uuid, target_item_ids uuid[])
returns integer language sql security definer set search_path = ''
as $$ select public.inspiration_link_for(auth.uid(), target_room_id, target_item_ids); $$;

create function public.unlink_inspiration_from_room(target_room_id uuid, target_item_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  if coalesce(cardinality(target_item_ids), 0) not between 1 and 100 then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if not public.inspiration_actor_can_edit_room(auth.uid(), target_room_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  delete from public.room_inspiration
  where room_id = target_room_id and item_id = any(target_item_ids);
  get diagnostics removed = row_count;
  return removed;
end;
$$;

create function public.create_capture_connect_code(target_workspace_id uuid, connect_code_hash text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  expires timestamptz := now() + interval '10 minutes';
begin
  if not public.inspiration_actor_is_member(auth.uid(), target_workspace_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if (
    select count(*) from public.capture_connect_codes
    where user_id = auth.uid() and redeemed_at is null and expires_at > now()
  ) >= 5 then
    raise exception 'too_many_codes' using errcode = 'P0001';
  end if;
  insert into public.capture_connect_codes (user_id, workspace_id, code_hash, expires_at)
  values (auth.uid(), target_workspace_id, connect_code_hash, expires);
  return expires;
end;
$$;

create function public.revoke_capture_token(target_token_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.capture_tokens
  set revoked_at = now()
  where id = target_token_id and user_id = auth.uid() and revoked_at is null;
  return found;
end;
$$;

-- Service-role RPCs (shelf routes; the route has already resolved the token).
create function public.capture_inspiration_intent(
  actor_user_id uuid, target_workspace_id uuid, item_hash text, item_mime text, item_size integer,
  item_width integer, item_height integer, item_source_url text, item_note text, item_channel text
)
returns jsonb language sql security definer set search_path = ''
as $$
  select public.inspiration_intent_for(actor_user_id, target_workspace_id, item_hash, item_mime,
    item_size, item_width, item_height, item_source_url, item_note, item_channel);
$$;

create function public.capture_finalize_inspiration_item(actor_user_id uuid, target_item_id uuid)
returns void language sql security definer set search_path = ''
as $$ select public.inspiration_settle_for(actor_user_id, target_item_id, 'ready'); $$;

create function public.capture_fail_inspiration_item(actor_user_id uuid, target_item_id uuid)
returns void language sql security definer set search_path = ''
as $$ select public.inspiration_settle_for(actor_user_id, target_item_id, 'failed'); $$;

create function public.capture_link_inspiration_to_room(actor_user_id uuid, target_room_id uuid, target_item_id uuid)
returns integer language sql security definer set search_path = ''
as $$ select public.inspiration_link_for(actor_user_id, target_room_id, array[target_item_id]); $$;

create function public.redeem_capture_connect_code(connect_code_hash text, new_token_hash text, new_device_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  code public.capture_connect_codes;
  workspace_name text;
begin
  select * into code from public.capture_connect_codes
  where code_hash = connect_code_hash
  for update;
  if not found
    or code.redeemed_at is not null
    or code.expires_at <= now()
    or not public.inspiration_actor_is_member(code.user_id, code.workspace_id) then
    raise exception 'invalid_code' using errcode = 'P0001';
  end if;

  update public.capture_connect_codes set redeemed_at = now() where id = code.id;
  update public.capture_tokens
  set revoked_at = now()
  where user_id = code.user_id and workspace_id = code.workspace_id and revoked_at is null;
  insert into public.capture_tokens (user_id, workspace_id, device_name, token_hash)
  values (code.user_id, code.workspace_id, btrim(new_device_name), new_token_hash);

  select name into workspace_name from public.workspaces where id = code.workspace_id;
  return jsonb_build_object('workspace_id', code.workspace_id, 'workspace_name', workspace_name);
end;
$$;

create function public.resolve_capture_token(presented_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  token public.capture_tokens;
begin
  select * into token from public.capture_tokens
  where token_hash = presented_token_hash and revoked_at is null;
  if not found or not public.inspiration_actor_is_member(token.user_id, token.workspace_id) then
    return null;
  end if;
  if token.last_used_at is null or token.last_used_at < now() - interval '1 minute' then
    update public.capture_tokens set last_used_at = now() where id = token.id;
  end if;
  return jsonb_build_object(
    'token_id', token.id, 'user_id', token.user_id, 'workspace_id', token.workspace_id
  );
end;
$$;

create function public.list_capture_rooms(actor_user_id uuid, target_workspace_id uuid)
returns table (room_id uuid, room_name text, project_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select room.id, room.name, project.name
  from public.rooms room
  join public.projects project on project.id = room.project_id
  join public.room_participants participant
    on participant.room_id = room.id
   and participant.user_id = actor_user_id
   and participant.access = 'edit'
  where room.workspace_id = target_workspace_id
    and public.inspiration_actor_is_member(actor_user_id, target_workspace_id)
  order by project.name, room.name;
$$;

revoke all on function public.create_inspiration_intent(uuid, text, text, integer, integer, integer, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.finalize_inspiration_item(uuid) from public, anon, authenticated, service_role;
revoke all on function public.fail_inspiration_item(uuid) from public, anon, authenticated, service_role;
revoke all on function public.update_inspiration_note(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.delete_inspiration_items(uuid[]) from public, anon, authenticated, service_role;
revoke all on function public.link_inspiration_to_room(uuid, uuid[]) from public, anon, authenticated, service_role;
revoke all on function public.unlink_inspiration_from_room(uuid, uuid[]) from public, anon, authenticated, service_role;
revoke all on function public.create_capture_connect_code(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.revoke_capture_token(uuid) from public, anon, authenticated, service_role;
revoke all on function public.capture_inspiration_intent(uuid, uuid, text, text, integer, integer, integer, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.capture_finalize_inspiration_item(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.capture_fail_inspiration_item(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.capture_link_inspiration_to_room(uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.redeem_capture_connect_code(text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.resolve_capture_token(text) from public, anon, authenticated, service_role;
revoke all on function public.list_capture_rooms(uuid, uuid) from public, anon, authenticated, service_role;

grant execute on function public.create_inspiration_intent(uuid, text, text, integer, integer, integer, text, text, text) to authenticated;
grant execute on function public.finalize_inspiration_item(uuid) to authenticated;
grant execute on function public.fail_inspiration_item(uuid) to authenticated;
grant execute on function public.update_inspiration_note(uuid, text) to authenticated;
grant execute on function public.delete_inspiration_items(uuid[]) to authenticated;
grant execute on function public.link_inspiration_to_room(uuid, uuid[]) to authenticated;
grant execute on function public.unlink_inspiration_from_room(uuid, uuid[]) to authenticated;
grant execute on function public.create_capture_connect_code(uuid, text) to authenticated;
grant execute on function public.revoke_capture_token(uuid) to authenticated;
grant execute on function public.capture_inspiration_intent(uuid, uuid, text, text, integer, integer, integer, text, text, text) to service_role;
grant execute on function public.capture_finalize_inspiration_item(uuid, uuid) to service_role;
grant execute on function public.capture_fail_inspiration_item(uuid, uuid) to service_role;
grant execute on function public.capture_link_inspiration_to_room(uuid, uuid, uuid) to service_role;
grant execute on function public.redeem_capture_connect_code(text, text, text) to service_role;
grant execute on function public.resolve_capture_token(text) to service_role;
grant execute on function public.list_capture_rooms(uuid, uuid) to service_role;

-- Storage: private bucket, members read/write under their workspace prefix.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inspiration', 'inspiration', false, 10485760, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create function public.storage_inspiration_workspace_id(object_name text)
returns uuid
language plpgsql
immutable
security definer
set search_path = ''
as $$
begin
  if object_name is null
    or object_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f-]{36}\.(png|jpg|webp)$'
  then
    return null;
  end if;
  return split_part(object_name, '/', 1)::uuid;
exception
  when others then
    return null;
end;
$$;
revoke all on function public.storage_inspiration_workspace_id(text) from public;
grant execute on function public.storage_inspiration_workspace_id(text) to authenticated;

create policy "Workspace members can read inspiration objects"
on storage.objects for select to authenticated
using (
  bucket_id = 'inspiration'
  and public.is_workspace_member(public.storage_inspiration_workspace_id(name))
);

create policy "Workspace members can upload inspiration objects"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'inspiration'
  and owner_id = auth.uid()::text
  and public.is_workspace_member(public.storage_inspiration_workspace_id(name))
);

-- Upsert (a retried upload into the same path) needs update.
create policy "Workspace members can replace their inspiration objects"
on storage.objects for update to authenticated
using (
  bucket_id = 'inspiration'
  and public.is_workspace_member(public.storage_inspiration_workspace_id(name))
)
with check (
  bucket_id = 'inspiration'
  and owner_id = auth.uid()::text
  and public.is_workspace_member(public.storage_inspiration_workspace_id(name))
);

create policy "Workspace members can delete inspiration objects"
on storage.objects for delete to authenticated
using (
  bucket_id = 'inspiration'
  and public.is_workspace_member(public.storage_inspiration_workspace_id(name))
);
