begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

select has_column(
  'public'::name,
  'design_screens'::name,
  'screen_key'::name,
  'design_screens.screen_key exists'::text
);
select is(
  (
    select is_nullable::text
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'design_screens'
      and column_name = 'screen_key'
  ),
  'YES'::text,
  'design_screens.screen_key is nullable'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('89000000-0000-4000-8000-000000000001','authenticated','authenticated','key-owner@example.com','',now(),'{}','{}',now(),now());

insert into public.workspaces (id, name, created_by)
values (
  '89000000-0000-4000-8000-000000000002',
  'Screen Key Workspace',
  '89000000-0000-4000-8000-000000000001'
);
insert into public.projects (id, workspace_id, name, created_by)
values (
  '89000000-0000-4000-8000-000000000003',
  '89000000-0000-4000-8000-000000000002',
  'Screen Key Project',
  '89000000-0000-4000-8000-000000000001'
);
insert into public.rooms (id, workspace_id, project_id, name, owner_id)
values (
  '89000000-0000-4000-8000-000000000004',
  '89000000-0000-4000-8000-000000000002',
  '89000000-0000-4000-8000-000000000003',
  'Screen Key Room',
  '89000000-0000-4000-8000-000000000001'
);

insert into public.design_screens (
  id, room_id, workspace_id, name, screen_key, created_by
)
values (
  '8a000000-0000-4000-8000-000000000001',
  '89000000-0000-4000-8000-000000000004',
  '89000000-0000-4000-8000-000000000002',
  'Checkout',
  'checkout',
  '89000000-0000-4000-8000-000000000001'
);

select throws_ok(
  $$ insert into public.design_screens (
       id, room_id, workspace_id, name, screen_key, created_by
     ) values (
       '8a000000-0000-4000-8000-000000000002',
       '89000000-0000-4000-8000-000000000004',
       '89000000-0000-4000-8000-000000000002',
       'Checkout Again',
       'checkout',
       '89000000-0000-4000-8000-000000000001'
     ) $$,
  '23505',
  null,
  'two live screens in one room cannot share a key'
);

update public.design_screens
set deleted_at = now()
where id = '8a000000-0000-4000-8000-000000000001';

insert into public.design_screens (
  id, room_id, workspace_id, name, screen_key, created_by
)
values (
  '8a000000-0000-4000-8000-000000000003',
  '89000000-0000-4000-8000-000000000004',
  '89000000-0000-4000-8000-000000000002',
  'Checkout Reborn',
  'checkout',
  '89000000-0000-4000-8000-000000000001'
);
select is(
  (
    select screen_key
    from public.design_screens
    where id = '8a000000-0000-4000-8000-000000000003'
  ),
  'checkout'::text,
  'a soft-deleted screen frees its key for another live screen'
);

select throws_ok(
  $$ insert into public.design_screens (
       id, room_id, workspace_id, name, screen_key, created_by
     ) values (
       '8a000000-0000-4000-8000-000000000004',
       '89000000-0000-4000-8000-000000000004',
       '89000000-0000-4000-8000-000000000002',
       'Bad Key Screen',
       'Bad Key',
       '89000000-0000-4000-8000-000000000001'
     ) $$,
  '23514',
  null,
  'the format check rejects an invalid key'
);

-- A null screen_key never conflicts, even across multiple screens.
insert into public.design_screens (
  id, room_id, workspace_id, name, created_by
)
values (
  '8a000000-0000-4000-8000-000000000005',
  '89000000-0000-4000-8000-000000000004',
  '89000000-0000-4000-8000-000000000002',
  'Unkeyed One',
  '89000000-0000-4000-8000-000000000001'
);
insert into public.design_screens (
  id, room_id, workspace_id, name, created_by
)
values (
  '8a000000-0000-4000-8000-000000000006',
  '89000000-0000-4000-8000-000000000004',
  '89000000-0000-4000-8000-000000000002',
  'Unkeyed Two',
  '89000000-0000-4000-8000-000000000001'
);
select is(
  (
    select count(*)::integer
    from public.design_screens
    where room_id = '89000000-0000-4000-8000-000000000004'
      and screen_key is null
  ),
  2,
  'multiple null keys are allowed in the same room'
);

select * from finish();
rollback;
