begin;

create extension if not exists pgtap with schema extensions;

select plan(27);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '10000000-0000-4000-8000-000000000001', 'authenticated',
    'authenticated', 'owner@example.com', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '10000000-0000-4000-8000-000000000002', 'authenticated',
    'authenticated', 'participant@example.com', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '10000000-0000-4000-8000-000000000003', 'authenticated',
    'authenticated', 'org-member@example.com', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '10000000-0000-4000-8000-000000000004', 'authenticated',
    'authenticated', 'outsider@example.com', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);

insert into public.organizations (id, name, created_by)
values (
  '20000000-0000-4000-8000-000000000001',
  'Northstar',
  auth.uid()
);

insert into public.memberships (organization_id, user_id, role)
values
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    'member'
  ),
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000003',
    'member'
  );

insert into public.discovery_rooms (id, organization_id, name, owner_id)
values (
  '30000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'Customer discovery',
  auth.uid()
);

select is(
  (
    select access::text
    from public.room_participants
    where room_id = '30000000-0000-4000-8000-000000000001'
      and user_id = auth.uid()
  ),
  'edit',
  'room owner is always an edit participant'
);

select lives_ok(
  $$
    insert into public.room_participants (room_id, user_id, access)
    values (
      '30000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002',
      'view'
    )
  $$,
  'owner can add an organization member as an explicit participant'
);

select throws_ok(
  $$
    insert into public.room_participants (room_id, user_id, access)
    values (
      '30000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000004',
      'view'
    )
  $$,
  '42501',
  null,
  'owner cannot add a non-member as a room participant'
);

select lives_ok(
  $$
    insert into public.messages (room_id, client_id, author_id, body)
    values (
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      auth.uid(),
      'Owner note'
    )
  $$,
  'owner can post'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000002',
  true
);

select is(
  (select count(*)::int from public.discovery_rooms),
  1,
  'explicit participant can select the room'
);

select is(
  (select count(*)::int from public.messages),
  1,
  'explicit participant can select room messages'
);

select lives_ok(
  $$
    insert into public.messages (room_id, client_id, author_id, body)
    values (
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000002',
      auth.uid(),
      'Participant note'
    )
  $$,
  'explicit participant can post'
);

select throws_ok(
  $$
    insert into public.messages (room_id, client_id, author_id, body)
    values (
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000003',
      '10000000-0000-4000-8000-000000000001',
      'Spoofed owner note'
    )
  $$,
  '42501',
  null,
  'participant cannot spoof another author'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000003',
  true
);

select is(
  (select count(*)::int from public.discovery_rooms),
  0,
  'organization membership alone cannot select a room'
);

select is(
  (select count(*)::int from public.messages),
  0,
  'organization membership alone cannot select room messages'
);

select throws_ok(
  $$
    insert into public.messages (room_id, client_id, author_id, body)
    values (
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000004',
      auth.uid(),
      'Intrusion'
    )
  $$,
  '42501',
  null,
  'non-participant organization member cannot post'
);

select is(
  public.can_access_room_topic(
    'room:30000000-0000-4000-8000-000000000001'
  ),
  false,
  'non-participant cannot authorize a private room channel'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000002',
  true
);

select is(
  public.can_access_room_topic(
    'room:30000000-0000-4000-8000-000000000001'
  ),
  true,
  'participant can authorize the exact private room channel'
);

select is(
  public.can_access_room_topic('room:not-a-uuid'),
  false,
  'malformed room topics fail closed'
);

select throws_ok(
  $$
    insert into public.messages (room_id, client_id, author_id, body)
    values (
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000002',
      auth.uid(),
      'Duplicate retry'
    )
  $$,
  '23505',
  null,
  'client IDs are idempotent per room'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);

select throws_ok(
  $$
    delete from public.room_participants
    where room_id = '30000000-0000-4000-8000-000000000001'
      and user_id = '10000000-0000-4000-8000-000000000001'
  $$,
  'P0001',
  'Room owner participation cannot be removed',
  'owner participant cannot be removed'
);

select throws_ok(
  $$
    update public.room_participants
    set access = 'view'
    where room_id = '30000000-0000-4000-8000-000000000001'
      and user_id = '10000000-0000-4000-8000-000000000001'
  $$,
  'P0001',
  'Room owner must retain edit access',
  'owner participant cannot be downgraded'
);

select throws_ok(
  $$
    update public.discovery_rooms
    set owner_id = '10000000-0000-4000-8000-000000000002'
    where id = '30000000-0000-4000-8000-000000000001'
  $$,
  'P0001',
  'Room organization and owner cannot be changed',
  'an editor cannot transfer immutable room ownership'
);

select throws_ok(
  $$
    update public.room_participants
    set user_id = '10000000-0000-4000-8000-000000000003'
    where room_id = '30000000-0000-4000-8000-000000000001'
      and user_id = '10000000-0000-4000-8000-000000000002'
  $$,
  'P0001',
  'Room participant identity cannot be changed',
  'an editor cannot rewrite participant identity'
);

select lives_ok(
  $$
    insert into storage.objects (bucket_id, name, owner_id)
    values (
      'discovery-attachments',
      '30000000-0000-4000-8000-000000000001/file.txt',
      auth.uid()::text
    )
  $$,
  'participant can create a private room object'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000003',
  true
);

select is(
  (
    select count(*)::int
    from storage.objects
    where bucket_id = 'discovery-attachments'
  ),
  0,
  'non-participant cannot select private room objects'
);

select throws_ok(
  $$
    insert into storage.objects (bucket_id, name, owner_id)
    values (
      'discovery-attachments',
      '30000000-0000-4000-8000-000000000001/intrusion.txt',
      auth.uid()::text
    )
  $$,
  '42501',
  null,
  'non-participant cannot upload into a room path'
);

select has_policy(
  'realtime',
  'messages',
  'Room participants can receive private room events',
  'private Realtime receive authorization is protected by RLS'
);

select has_policy(
  'realtime',
  'messages',
  'Room participants can send private room events',
  'private Realtime send authorization is protected by RLS'
);

select is(
  (
    select count(*)::int
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename in ('messages', 'mentions', 'decisions')
  ),
  3,
  'message, mention, and decision tables are published to Realtime'
);

select is(
  (
    select public.storage_room_id(
      '30000000-0000-4000-8000-000000000001/file.txt'
    )
  ),
  '30000000-0000-4000-8000-000000000001'::uuid,
  'storage paths derive the room from the first segment'
);

select is(
  public.storage_room_id('../escape.txt'),
  null,
  'malformed storage paths fail closed'
);

select * from finish();
rollback;
