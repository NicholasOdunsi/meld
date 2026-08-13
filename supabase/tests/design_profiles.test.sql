begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

select has_table(
  'public'::name,
  'design_system_profiles'::name,
  'design profiles exist'::text
);
select has_table(
  'public'::name,
  'design_system_profile_versions'::name,
  'design profile versions exist'::text
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.design_system_profile_versions',
    'INSERT'
  ),
  'authenticated users cannot insert profile versions directly'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.set_active_design_profile_version(uuid)',
    'EXECUTE'
  ),
  'anonymous users cannot activate profile versions'
);
select ok(
  exists (
    select 1 from storage.buckets
    where id = 'design-system' and not public
  ),
  'the design-system bucket is private'
);
select is(
  public.storage_workspace_id(
    '81000000-0000-4000-8000-000000000001/source.md'
  ),
  '81000000-0000-4000-8000-000000000001'::uuid,
  'storage paths expose their workspace prefix'
);
select is(
  public.storage_workspace_id(
    '81000000-0000-4000-8000-000000000001/../secret.md'
  ),
  null,
  'storage paths reject traversal segments'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('80000000-0000-4000-8000-000000000001','authenticated','authenticated','profile-owner@example.com','',now(),'{}','{}',now(),now()),
  ('80000000-0000-4000-8000-000000000002','authenticated','authenticated','profile-outsider@example.com','',now(),'{}','{}',now(),now());

insert into public.workspaces (id, name, created_by)
values (
  '81000000-0000-4000-8000-000000000001',
  'Profile Workspace',
  '80000000-0000-4000-8000-000000000001'
);

insert into public.design_system_profile_versions (
  id,
  workspace_id,
  profile_json,
  token_css,
  created_by
)
values (
  '82000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001',
  '{"colors":[],"typeScale":[],"spacing":[],"radii":[],"components":[]}',
  ':root {}',
  '80000000-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '80000000-0000-4000-8000-000000000002',
  true
);

select is(
  (select count(*)::integer from public.design_system_profile_versions),
  0,
  'a non-member cannot read profile versions'
);
select throws_ok(
  $$ select public.set_active_design_profile_version(
    '82000000-0000-4000-8000-000000000001'
  ) $$,
  'P0001',
  'not_authorized',
  'a non-member cannot activate a profile version'
);

select set_config(
  'request.jwt.claim.sub',
  '80000000-0000-4000-8000-000000000001',
  true
);
select lives_ok(
  $$ select public.set_active_design_profile_version(
    '82000000-0000-4000-8000-000000000001'
  ) $$,
  'a workspace member can activate a profile version'
);
select is(
  (
    select active_version_id
    from public.design_system_profiles
    where workspace_id = '81000000-0000-4000-8000-000000000001'
  ),
  '82000000-0000-4000-8000-000000000001'::uuid,
  'the active pointer references the selected version'
);

reset role;
select throws_ok(
  $$ update public.design_system_profile_versions
    set token_css = ':root { --changed: true; }'
    where id = '82000000-0000-4000-8000-000000000001' $$,
  'P0001',
  'design_profile_version_immutable',
  'profile versions cannot be updated'
);
select throws_ok(
  $$ delete from public.design_system_profile_versions
    where id = '82000000-0000-4000-8000-000000000001' $$,
  'P0001',
  'design_profile_version_immutable',
  'profile versions cannot be deleted'
);
select throws_ok(
  $$ insert into public.design_system_profile_versions (
      workspace_id, profile_json, token_css, created_by
    ) values (
      '81000000-0000-4000-8000-000000000001',
      jsonb_build_object('oversized', repeat('x', 65536)),
      ':root {}',
      '80000000-0000-4000-8000-000000000001'
    ) $$,
  '23514',
  null,
  'the database enforces the 64 KiB profile cap'
);

select * from finish();
rollback;
