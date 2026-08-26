-- 202608270004_recompile_design_component_css.sql narrows
-- design_profile_version_immutable to allow a component_css-only update, and
-- adds set_design_component_css as the one sanctioned way to make it. This
-- covers both: the trigger still refuses every other column and any delete,
-- and the function enforces membership, existence, and rejects a css value
-- that could break out of the <style> tag it is later rendered into.

begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

select has_function(
  'public'::name,
  'set_design_component_css'::name,
  array['uuid', 'text']::name[],
  'set_design_component_css exists'::text
);
select ok(
  not has_function_privilege(
    'anon',
    'public.set_design_component_css(uuid, text)',
    'EXECUTE'
  ),
  'anonymous users cannot recompile component css'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('f1000000-0000-4000-8000-000000000001','authenticated','authenticated','recompile-owner@example.com','',now(),'{}','{}',now(),now()),
  ('f1000000-0000-4000-8000-000000000002','authenticated','authenticated','recompile-outsider@example.com','',now(),'{}','{}',now(),now());

insert into public.workspaces (id, name, created_by)
values (
  'f2000000-0000-4000-8000-000000000001',
  'Recompile Workspace',
  'f1000000-0000-4000-8000-000000000001'
);
insert into public.design_system_profile_versions (
  id, workspace_id, profile_json, token_css, component_css, created_by
)
values (
  'f3000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001',
  '{"colors":[],"typeScale":[],"spacing":[],"radii":[],"components":[]}',
  ':root {}',
  '.ds-button{font-weight:600}',
  'f1000000-0000-4000-8000-000000000001'
);

-- The trigger: every other column, and any delete, is still refused.
select throws_ok(
  $$ update public.design_system_profile_versions
    set token_css = ':root { --changed: true; }'
    where id = 'f3000000-0000-4000-8000-000000000001' $$,
  'P0001',
  'design_profile_version_immutable',
  'a column other than component_css still cannot be updated'
);
select throws_ok(
  $$ delete from public.design_system_profile_versions
    where id = 'f3000000-0000-4000-8000-000000000001' $$,
  'P0001',
  'design_profile_version_immutable',
  'a profile version still cannot be deleted'
);

-- The trigger: component_css alone is now allowed through a direct update
-- (set_design_component_css is the sanctioned entry point below, but the
-- column-level exemption is the trigger's own behavior and is tested
-- directly here).
select lives_ok(
  $$ update public.design_system_profile_versions
    set component_css = '.ds-button{font-weight:700}'
    where id = 'f3000000-0000-4000-8000-000000000001' $$,
  'component_css alone can be updated directly'
);
select is(
  (
    select component_css from public.design_system_profile_versions
    where id = 'f3000000-0000-4000-8000-000000000001'
  ),
  '.ds-button{font-weight:700}',
  'the direct component_css update took effect'
);

-- set_design_component_css: existence, membership, and the injection guard.
select throws_ok(
  $$ select public.set_design_component_css(
    'f3000000-0000-4000-8000-000000000099', 'x{}'
  ) $$,
  'P0001',
  'design_profile_version_not_found',
  'set_design_component_css refuses an unknown version id'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'f1000000-0000-4000-8000-000000000002',
  true
);
select throws_ok(
  $$ select public.set_design_component_css(
    'f3000000-0000-4000-8000-000000000001', 'x{}'
  ) $$,
  'P0001',
  'not_authorized',
  'set_design_component_css refuses a non-member'
);

select set_config(
  'request.jwt.claim.sub',
  'f1000000-0000-4000-8000-000000000001',
  true
);
select throws_ok(
  $$ select public.set_design_component_css(
    'f3000000-0000-4000-8000-000000000001',
    '.ds-button{font-weight:700}</style><script>alert(1)</script>'
  ) $$,
  'P0001',
  'invalid_component_css',
  'set_design_component_css refuses css that could break out of a style tag'
);
-- Pins the boundary rather than assuming it (fix round 2, review): a bare
-- `<` guard would have refused this -- legitimate container/media query
-- range syntax the connector can produce -- so only `</` is refused.
select lives_ok(
  $$ select public.set_design_component_css(
    'f3000000-0000-4000-8000-000000000001',
    '@media (width < 600px) { .ds-button { font-size: 14px; } }'
  ) $$,
  'set_design_component_css accepts a media query using range syntax with a bare <'
);
select lives_ok(
  $$ select public.set_design_component_css(
    'f3000000-0000-4000-8000-000000000001',
    '.ds-button{font-weight:800}'
  ) $$,
  'a member can recompile component css through set_design_component_css'
);

reset role;
select is(
  (
    select component_css from public.design_system_profile_versions
    where id = 'f3000000-0000-4000-8000-000000000001'
  ),
  '.ds-button{font-weight:800}',
  'set_design_component_css wrote the new component css'
);

select * from finish();
rollback;
