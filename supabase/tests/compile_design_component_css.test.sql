-- `component_css` is produced by the database, in the same statement that
-- writes the profile it describes (202608270009). This file covers the
-- compiler itself, and the immutability it let 202608270004 restore.
--
-- 202608270004 had narrowed `design_profile_version_immutable` to allow a
-- `component_css`-only update, and added `set_design_component_css`, so that
-- apps/web could repair the column from the browser side after a build pass.
-- That repair is gone: it left the column stale for every reader who arrived
-- before somebody opened the Design System page, it put a second
-- implementation of one rule in a second language, and its `like '%</%'`
-- guard rejected exactly the `url("data:image/svg+xml,<svg ... </svg>")`
-- values the component build prompt requires. So the hole is closed and the
-- function is gone, and both facts are pinned here.

begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

select has_function(
  'public'::name,
  'compile_design_component_css'::name,
  array['jsonb']::name[],
  'compile_design_component_css exists'::text
);
select ok(
  not has_function_privilege(
    'anon',
    'public.compile_design_component_css(jsonb)',
    'EXECUTE'
  ),
  'anonymous users cannot compile component css'
);

-- The pinned fixture. packages/prototype/src/component-css.test.ts asserts
-- `compileComponentCss` produces this same string for this same profile: the
-- connector compiles a distillation's stylesheet with that function and the
-- database compiles a build pass's with this one, so the two must agree
-- byte for byte or a design system changes character mid-pass.
select is(
  public.compile_design_component_css('{
    "components": [
      {"name": "built_a", "rules": "x", "css": ".ds-built-a { color: red; }"},
      {"name": "prose_b", "rules": "x"},
      {"name": "built_c", "rules": "x", "css": ".ds-built-c { padding: 4px; }"}
    ]
  }'::jsonb),
  '/* ds:built_a */' || chr(10) || '.ds-built-a { color: red; }' || chr(10) ||
  '/* ds:built_c */' || chr(10) || '.ds-built-c { padding: 4px; }',
  'the compiled stylesheet is one marked block per component that has css, in profile order'
);

-- Shape guards, for the same reason `pending_design_components` has them:
-- this runs inside an AFTER trigger on ai_tasks, where a raise aborts
-- settle_ai_task and wedges the run.
select is(
  public.compile_design_component_css('{"components": "not-an-array"}'::jsonb),
  '',
  'a profile whose components are not an array compiles to nothing rather than raising'
);
select is(
  public.compile_design_component_css('{"components": [1, "two", {"css": ".x{}"}]}'::jsonb),
  '',
  'entries that are not objects, and objects with no name, are skipped'
);

-- MAX_COMPONENT_CSS_TOTAL_BYTES is 49152, and the TypeScript compiler STOPS
-- at the first block that would breach it rather than skipping that one and
-- carrying on -- so the output is a prefix. `tiny` here is well within what
-- is left over and must still be absent.
select is(
  public.compile_design_component_css(jsonb_build_object(
    'components',
    jsonb_build_array(
      jsonb_build_object('name', 'big_a', 'css', repeat('a', 30000)),
      jsonb_build_object('name', 'big_b', 'css', repeat('b', 30000)),
      jsonb_build_object('name', 'tiny', 'css', '.ds-tiny{}')
    )
  )),
  '/* ds:big_a */' || chr(10) || repeat('a', 30000),
  'the stylesheet stops at the first block that would pass 48 KiB, and stays stopped'
);

-- Immutability, restored in full.
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('f1000000-0000-4000-8000-000000000001','authenticated','authenticated','compile-owner@example.com','',now(),'{}','{}',now(),now());

insert into public.workspaces (id, name, created_by)
values (
  'f2000000-0000-4000-8000-000000000001',
  'Compile Workspace',
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

select throws_ok(
  $$ update public.design_system_profile_versions
    set token_css = ':root { --changed: true; }'
    where id = 'f3000000-0000-4000-8000-000000000001' $$,
  'P0001',
  'design_profile_version_immutable',
  'a profile version still cannot have another column updated'
);
-- The exemption 202608270004 opened is closed again: nothing needs it now
-- that the merge itself writes the right value.
select throws_ok(
  $$ update public.design_system_profile_versions
    set component_css = '.ds-button{font-weight:700}'
    where id = 'f3000000-0000-4000-8000-000000000001' $$,
  'P0001',
  'design_profile_version_immutable',
  'component_css is immutable again -- there is no repair path to keep open'
);
select hasnt_function(
  'public'::name,
  'set_design_component_css'::name,
  array['uuid', 'text']::name[],
  'set_design_component_css is gone, and with it its </-rejecting guard'::text
);

select * from finish();
rollback;
