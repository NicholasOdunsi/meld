begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

select has_function(
  'public'::name,
  'list_room_people'::name,
  array['uuid', 'uuid[]']::name[],
  'the scoped Room identity function exists'::text
);
select function_returns(
  'public'::name,
  'list_room_people'::name,
  array['uuid', 'uuid[]']::name[],
  'setof record'::name,
  'the Room identity function returns rows'::text
);
select ok(
  not has_function_privilege(
    'anon',
    'public.list_room_people(uuid, uuid[])',
    'EXECUTE'
  ),
  'anonymous users cannot resolve Room identities'::text
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '17000000-0000-4000-8000-000000000001', 'authenticated',
    'authenticated', 'room-owner@example.com', '', now(), '{}', '{}', now(), now()
  ),
  (
    '17000000-0000-4000-8000-000000000002', 'authenticated',
    'authenticated', 'room-editor@example.com', '', now(), '{}', '{}', now(), now()
  ),
  (
    '17000000-0000-4000-8000-000000000003', 'authenticated',
    'authenticated', 'former-author@example.com', '', now(), '{}', '{}', now(), now()
  ),
  (
    '17000000-0000-4000-8000-000000000004', 'authenticated',
    'authenticated', 'workspace-only@example.com', '', now(), '{}', '{}', now(), now()
  );

insert into public.workspaces (id, name, created_by)
values (
  '27000000-0000-4000-8000-000000000001',
  'Room people workspace',
  '17000000-0000-4000-8000-000000000001'
);

insert into public.memberships (workspace_id, user_id, role)
values
  (
    '27000000-0000-4000-8000-000000000001',
    '17000000-0000-4000-8000-000000000002',
    'member'
  ),
  (
    '27000000-0000-4000-8000-000000000001',
    '17000000-0000-4000-8000-000000000003',
    'member'
  ),
  (
    '27000000-0000-4000-8000-000000000001',
    '17000000-0000-4000-8000-000000000004',
    'member'
  );

insert into public.projects (id, workspace_id, name, created_by)
values (
  '77000000-0000-4000-8000-000000000001',
  '27000000-0000-4000-8000-000000000001',
  'Room people project',
  '17000000-0000-4000-8000-000000000001'
);

insert into public.rooms (
  id, workspace_id, project_id, name, owner_id
)
values (
  '47000000-0000-4000-8000-000000000001',
  '27000000-0000-4000-8000-000000000001',
  '77000000-0000-4000-8000-000000000001',
  'Room people room',
  '17000000-0000-4000-8000-000000000001'
);

insert into public.room_participants (
  room_id, user_id, access, added_by
)
values
  (
    '47000000-0000-4000-8000-000000000001',
    '17000000-0000-4000-8000-000000000002',
    'edit',
    '17000000-0000-4000-8000-000000000001'
  ),
  (
    '47000000-0000-4000-8000-000000000001',
    '17000000-0000-4000-8000-000000000003',
    'edit',
    '17000000-0000-4000-8000-000000000001'
  );

insert into public.decisions (
  id, room_id, summary, created_by
)
values (
  '87000000-0000-4000-8000-000000000001',
  '47000000-0000-4000-8000-000000000001',
  'Keep the historical author visible',
  '17000000-0000-4000-8000-000000000003'
);

delete from public.room_participants
where room_id = '47000000-0000-4000-8000-000000000001'
  and user_id = '17000000-0000-4000-8000-000000000003';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '17000000-0000-4000-8000-000000000001',
  true
);

select is(
  (
    select array_agg(person.email order by person.email)::text
    from public.list_room_people(
      '47000000-0000-4000-8000-000000000001',
      array[
        '17000000-0000-4000-8000-000000000001',
        '17000000-0000-4000-8000-000000000002',
        '17000000-0000-4000-8000-000000000003',
        '17000000-0000-4000-8000-000000000004'
      ]::uuid[]
    ) as person
  ),
  '{former-author@example.com,room-editor@example.com,room-owner@example.com}'::text,
  'only requested participants and historical decision authors are returned'::text
);
select is(
  (
    select count(*)::int
    from public.list_room_people(
      '47000000-0000-4000-8000-000000000001',
      array['17000000-0000-4000-8000-000000000004']::uuid[]
    )
  ),
  0,
  'a workspace-only member is not exposed'::text
);
select is(
  (
    select count(*)::int
    from public.list_room_people(
      '47000000-0000-4000-8000-000000000001',
      array[]::uuid[]
    )
  ),
  0,
  'an empty identity request returns no rows'::text
);
select is(
  (
    select count(*)::int
    from public.list_room_people(
      '47000000-0000-4000-8000-000000000001',
      null
    )
  ),
  0,
  'a null identity request returns no rows'::text
);

select set_config(
  'request.jwt.claim.sub',
  '17000000-0000-4000-8000-000000000004',
  true
);
select throws_ok(
  $$
    select *
    from public.list_room_people(
      '47000000-0000-4000-8000-000000000001',
      array['17000000-0000-4000-8000-000000000001']::uuid[]
    )
  $$,
  'P0001',
  'Room participation required',
  'a nonparticipant cannot resolve identities in the Room'::text
);

select * from finish();
rollback;
