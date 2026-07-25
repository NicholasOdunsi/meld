create type public.room_participant_access as enum ('view', 'edit');
create type public.attachment_extraction_status
as enum ('pending', 'ready', 'unsupported', 'failed');

create table public.discovery_rooms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  owner_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index discovery_rooms_organization_id_idx
  on public.discovery_rooms (organization_id);

create table public.room_participants (
  room_id uuid not null
    references public.discovery_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  access public.room_participant_access not null default 'view',
  added_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index room_participants_user_id_idx
  on public.room_participants (user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null
    references public.discovery_rooms(id) on delete cascade,
  client_id uuid not null,
  author_id uuid not null default auth.uid() references auth.users(id),
  body text not null check (char_length(btrim(body)) between 1 and 20000),
  created_at timestamptz not null default now(),
  unique (room_id, client_id),
  unique (id, room_id)
);

create index messages_room_created_at_idx
  on public.messages (room_id, created_at, id);

create table public.mentions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null
    references public.discovery_rooms(id) on delete cascade,
  message_id uuid not null,
  mentioned_user_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (message_id, mentioned_user_id),
  foreign key (message_id, room_id)
    references public.messages(id, room_id) on delete cascade
);

create index mentions_room_id_idx on public.mentions (room_id);
create index mentions_mentioned_user_id_idx
  on public.mentions (mentioned_user_id);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null
    references public.discovery_rooms(id) on delete cascade,
  message_id uuid,
  uploaded_by uuid not null default auth.uid() references auth.users(id),
  storage_path text not null unique
    check (
      storage_path like room_id::text || '/%'
      and storage_path !~ '(^|/)\.\.?(/|$)'
    ),
  original_name text not null
    check (char_length(btrim(original_name)) between 1 and 255),
  mime_type text not null check (
    mime_type in (
      'text/plain',
      'text/markdown',
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif'
    )
  ),
  byte_size bigint not null check (byte_size between 1 and 10485760),
  caption text check (
    caption is null or char_length(btrim(caption)) between 1 and 2000
  ),
  extraction_status public.attachment_extraction_status not null,
  extracted_text text check (
    extracted_text is null or char_length(extracted_text) <= 100000
  ),
  created_at timestamptz not null default now(),
  check (
    mime_type not like 'image/%'
    or char_length(btrim(coalesce(caption, ''))) between 1 and 2000
  ),
  check (
    (extraction_status = 'ready' and extracted_text is not null)
    or (extraction_status <> 'ready' and extracted_text is null)
  ),
  unique (id, room_id),
  foreign key (message_id, room_id)
    references public.messages(id, room_id) on delete cascade
);

create index attachments_room_id_idx on public.attachments (room_id);

create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null
    references public.discovery_rooms(id) on delete cascade,
  message_id uuid,
  attachment_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  note text check (
    note is null or char_length(btrim(note)) between 1 and 10000
  ),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  check (message_id is not null or attachment_id is not null or note is not null),
  foreign key (message_id, room_id)
    references public.messages(id, room_id) on delete cascade,
  foreign key (attachment_id, room_id)
    references public.attachments(id, room_id) on delete cascade
);

create index evidence_room_id_idx on public.evidence (room_id);

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null
    references public.discovery_rooms(id) on delete cascade,
  source_message_id uuid,
  summary text not null
    check (char_length(btrim(summary)) between 1 and 5000),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (source_message_id, room_id)
    references public.messages(id, room_id) on delete cascade
);

create index decisions_room_created_at_idx
  on public.decisions (room_id, created_at, id);

create function public.is_room_participant(target_room uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.room_participants as participant
    join public.discovery_rooms as room
      on room.id = participant.room_id
    join public.memberships as membership
      on membership.organization_id = room.organization_id
      and membership.user_id = participant.user_id
    where participant.room_id = target_room
      and participant.user_id = auth.uid()
  );
$$;

create function public.can_edit_room(target_room uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.room_participants as participant
    join public.discovery_rooms as room
      on room.id = participant.room_id
    join public.memberships as membership
      on membership.organization_id = room.organization_id
      and membership.user_id = participant.user_id
    where participant.room_id = target_room
      and participant.user_id = auth.uid()
      and participant.access = 'edit'
  );
$$;

create function public.room_user_is_org_member(
  target_room uuid,
  target_user uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.discovery_rooms as room
    join public.memberships as membership
      on membership.organization_id = room.organization_id
    where room.id = target_room
      and membership.user_id = target_user
  );
$$;

create function public.add_room_owner_participant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.room_participants (
    room_id,
    user_id,
    access,
    added_by
  )
  values (new.id, new.owner_id, 'edit', new.owner_id);
  return new;
end;
$$;

create trigger add_room_owner_participant
after insert on public.discovery_rooms
for each row execute function public.add_room_owner_participant();

create function public.protect_discovery_room_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.organization_id <> old.organization_id
    or new.owner_id <> old.owner_id
  then
    raise exception 'Room organization and owner cannot be changed'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger protect_discovery_room_identity
before update on public.discovery_rooms
for each row execute function public.protect_discovery_room_identity();

create function public.protect_room_owner_participant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  room_owner_id uuid;
begin
  if tg_op = 'UPDATE'
    and (
      new.room_id <> old.room_id
      or new.user_id <> old.user_id
      or new.added_by <> old.added_by
    )
  then
    raise exception 'Room participant identity cannot be changed'
      using errcode = 'P0001';
  end if;

  select room.owner_id
  into room_owner_id
  from public.discovery_rooms as room
  where room.id = old.room_id;

  if old.user_id = room_owner_id and tg_op = 'DELETE' then
    raise exception 'Room owner participation cannot be removed'
      using errcode = 'P0001';
  end if;

  if old.user_id = room_owner_id
    and (new.user_id <> room_owner_id or new.access <> 'edit')
  then
    raise exception 'Room owner must retain edit access'
      using errcode = 'P0001';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger protect_room_owner_participant
before update or delete on public.room_participants
for each row execute function public.protect_room_owner_participant();

create function public.can_access_room_topic(target_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_room uuid;
begin
  if target_topic is null
    or target_topic !~ '^room:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    return false;
  end if;
  target_room := substring(target_topic from 6)::uuid;
  return public.is_room_participant(target_room);
exception
  when others then
    return false;
end;
$$;

create function public.storage_room_id(object_name text)
returns uuid
language plpgsql
immutable
security definer
set search_path = ''
as $$
begin
  if object_name is null
    or object_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[^/].*$'
    or object_name ~ '(^|/)\.\.?(/|$)'
  then
    return null;
  end if;
  return split_part(object_name, '/', 1)::uuid;
exception
  when others then
    return null;
end;
$$;

revoke all on function public.is_room_participant(uuid) from public;
revoke all on function public.can_edit_room(uuid) from public;
revoke all on function public.room_user_is_org_member(uuid, uuid) from public;
revoke all on function public.add_room_owner_participant() from public;
revoke all on function public.protect_discovery_room_identity() from public;
revoke all on function public.protect_room_owner_participant() from public;
revoke all on function public.can_access_room_topic(text) from public;
revoke all on function public.storage_room_id(text) from public;

grant execute on function public.is_room_participant(uuid) to authenticated;
grant execute on function public.can_edit_room(uuid) to authenticated;
grant execute on function public.room_user_is_org_member(uuid, uuid)
  to authenticated;
grant execute on function public.can_access_room_topic(text) to authenticated;
grant execute on function public.storage_room_id(text) to authenticated;

alter table public.discovery_rooms enable row level security;
alter table public.room_participants enable row level security;
alter table public.messages enable row level security;
alter table public.mentions enable row level security;
alter table public.attachments enable row level security;
alter table public.evidence enable row level security;
alter table public.decisions enable row level security;

revoke all on table public.discovery_rooms from anon;
revoke all on table public.room_participants from anon;
revoke all on table public.messages from anon;
revoke all on table public.mentions from anon;
revoke all on table public.attachments from anon;
revoke all on table public.evidence from anon;
revoke all on table public.decisions from anon;

grant select, insert, update, delete
  on table public.discovery_rooms,
  public.room_participants,
  public.messages,
  public.mentions,
  public.attachments,
  public.evidence,
  public.decisions
  to authenticated;

create policy "Participants can view rooms"
on public.discovery_rooms for select to authenticated
using (public.is_room_participant(id));

create policy "Members can create owned rooms"
on public.discovery_rooms for insert to authenticated
with check (
  owner_id = auth.uid()
  and public.is_org_member(organization_id)
);

create policy "Editors can update rooms"
on public.discovery_rooms for update to authenticated
using (public.can_edit_room(id))
with check (
  public.can_edit_room(id)
);

create policy "Owners can delete rooms"
on public.discovery_rooms for delete to authenticated
using (
  owner_id = auth.uid()
  and public.is_room_participant(id)
);

create policy "Participants can view room participants"
on public.room_participants for select to authenticated
using (public.is_room_participant(room_id));

create policy "Editors can add organization room participants"
on public.room_participants for insert to authenticated
with check (
  added_by = auth.uid()
  and public.can_edit_room(room_id)
  and public.room_user_is_org_member(room_id, user_id)
);

create policy "Editors can update room participants"
on public.room_participants for update to authenticated
using (public.can_edit_room(room_id))
with check (
  public.can_edit_room(room_id)
  and public.room_user_is_org_member(room_id, user_id)
);

create policy "Editors can remove room participants"
on public.room_participants for delete to authenticated
using (public.can_edit_room(room_id));

create policy "Participants can view messages"
on public.messages for select to authenticated
using (public.is_room_participant(room_id));

create policy "Participants can post their messages"
on public.messages for insert to authenticated
with check (
  author_id = auth.uid()
  and public.is_room_participant(room_id)
);

create policy "Authors can update their messages"
on public.messages for update to authenticated
using (author_id = auth.uid() and public.is_room_participant(room_id))
with check (author_id = auth.uid() and public.is_room_participant(room_id));

create policy "Authors can delete their messages"
on public.messages for delete to authenticated
using (author_id = auth.uid() and public.is_room_participant(room_id));

create policy "Participants can view mentions"
on public.mentions for select to authenticated
using (public.is_room_participant(room_id));

create policy "Participants can create valid mentions"
on public.mentions for insert to authenticated
with check (
  created_by = auth.uid()
  and public.is_room_participant(room_id)
  and public.room_user_is_org_member(room_id, mentioned_user_id)
  and exists (
    select 1
    from public.room_participants as target
    where target.room_id = mentions.room_id
      and target.user_id = mentions.mentioned_user_id
  )
  and exists (
    select 1
    from public.messages as source_message
    where source_message.id = mentions.message_id
      and source_message.room_id = mentions.room_id
      and source_message.author_id = auth.uid()
  )
);

create policy "Mention creators can delete mentions"
on public.mentions for delete to authenticated
using (created_by = auth.uid() and public.is_room_participant(room_id));

create policy "Participants can view attachment metadata"
on public.attachments for select to authenticated
using (public.is_room_participant(room_id));

create policy "Participants can create their attachments"
on public.attachments for insert to authenticated
with check (
  uploaded_by = auth.uid()
  and public.is_room_participant(room_id)
);

create policy "Uploaders can update their attachments"
on public.attachments for update to authenticated
using (uploaded_by = auth.uid() and public.is_room_participant(room_id))
with check (uploaded_by = auth.uid() and public.is_room_participant(room_id));

create policy "Uploaders can delete their attachments"
on public.attachments for delete to authenticated
using (uploaded_by = auth.uid() and public.is_room_participant(room_id));

create policy "Participants can view evidence"
on public.evidence for select to authenticated
using (public.is_room_participant(room_id));

create policy "Participants can create their evidence"
on public.evidence for insert to authenticated
with check (
  created_by = auth.uid()
  and public.is_room_participant(room_id)
);

create policy "Evidence creators can update evidence"
on public.evidence for update to authenticated
using (created_by = auth.uid() and public.is_room_participant(room_id))
with check (created_by = auth.uid() and public.is_room_participant(room_id));

create policy "Evidence creators can delete evidence"
on public.evidence for delete to authenticated
using (created_by = auth.uid() and public.is_room_participant(room_id));

create policy "Participants can view decisions"
on public.decisions for select to authenticated
using (public.is_room_participant(room_id));

create policy "Participants can create their decisions"
on public.decisions for insert to authenticated
with check (
  created_by = auth.uid()
  and public.is_room_participant(room_id)
);

create policy "Decision creators can update decisions"
on public.decisions for update to authenticated
using (created_by = auth.uid() and public.is_room_participant(room_id))
with check (created_by = auth.uid() and public.is_room_participant(room_id));

create policy "Decision creators can delete decisions"
on public.decisions for delete to authenticated
using (created_by = auth.uid() and public.is_room_participant(room_id));

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'discovery-attachments',
  'discovery-attachments',
  false,
  10485760,
  array[
    'text/plain',
    'text/markdown',
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Room participants can read private room objects"
on storage.objects for select to authenticated
using (
  bucket_id = 'discovery-attachments'
  and public.is_room_participant(public.storage_room_id(name))
);

create policy "Room participants can upload private room objects"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'discovery-attachments'
  and owner_id = auth.uid()::text
  and public.is_room_participant(public.storage_room_id(name))
);

create policy "Room participants can update their private room objects"
on storage.objects for update to authenticated
using (
  bucket_id = 'discovery-attachments'
  and owner_id = auth.uid()::text
  and public.is_room_participant(public.storage_room_id(name))
)
with check (
  bucket_id = 'discovery-attachments'
  and owner_id = auth.uid()::text
  and public.is_room_participant(public.storage_room_id(name))
);

create policy "Room participants can delete their private room objects"
on storage.objects for delete to authenticated
using (
  bucket_id = 'discovery-attachments'
  and owner_id = auth.uid()::text
  and public.is_room_participant(public.storage_room_id(name))
);

alter table realtime.messages enable row level security;

create policy "Room participants can receive private room events"
on realtime.messages for select to authenticated
using (
  extension in ('broadcast', 'presence')
  and public.can_access_room_topic(realtime.topic())
);

create policy "Room participants can send private room events"
on realtime.messages for insert to authenticated
with check (
  extension in ('broadcast', 'presence')
  and public.can_access_room_topic(realtime.topic())
);

alter publication supabase_realtime
  add table public.messages, public.mentions, public.decisions;
