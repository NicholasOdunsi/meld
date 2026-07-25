begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '10000000-0000-4000-8000-000000000001', 'authenticated',
    'authenticated', 'author@example.com', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '10000000-0000-4000-8000-000000000002', 'authenticated',
    'authenticated', 'mentioned@example.com', '', now(),
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
values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  'member'
);

insert into public.discovery_rooms (id, organization_id, name, owner_id)
values (
  '40000000-0000-4000-8000-000000000004',
  '20000000-0000-4000-8000-000000000001',
  'Checkout',
  '10000000-0000-4000-8000-000000000001'
);

insert into public.room_participants (room_id, user_id, access)
values (
  '40000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000002',
  'edit'
);

insert into public.messages (id, room_id, client_id, author_id, body)
values (
  '60000000-0000-4000-8000-000000000006',
  '40000000-0000-4000-8000-000000000004',
  '70000000-0000-4000-8000-000000000007',
  '10000000-0000-4000-8000-000000000001',
  'Can you look at this, @mentioned?'
);

insert into public.mentions (
  id, room_id, message_id, mentioned_user_id, created_by
)
values (
  '50000000-0000-4000-8000-000000000005',
  '40000000-0000-4000-8000-000000000004',
  '60000000-0000-4000-8000-000000000006',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000002',
  true
);

select is(
  (
    select count(*)::int from public.mentions
    where mentioned_user_id = auth.uid()
      and acknowledged_at is null
  ),
  1,
  'the mentioned user sees one unacknowledged mention'
);

update public.mentions
  set acknowledged_at = now()
  where mentioned_user_id = auth.uid();

select is(
  (
    select count(*)::int from public.mentions
    where mentioned_user_id = auth.uid()
      and acknowledged_at is null
  ),
  0,
  'acknowledging clears it from the unacknowledged set'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);

update public.mentions set acknowledged_at = null;

select is(
  (
    select count(*)::int from public.mentions
    where acknowledged_at is null
  ),
  0,
  'a participant cannot un-acknowledge another user''s mention'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000002',
  true
);

select throws_ok(
  $$
    update public.mentions
      set mentioned_user_id = '10000000-0000-4000-8000-000000000001',
          acknowledged_at = now()
      where mentioned_user_id = auth.uid()
  $$,
  '42501',
  null,
  'a user cannot reassign their own mention to another user'
);

select * from finish();
rollback;
