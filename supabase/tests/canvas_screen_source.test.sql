begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('e1000000-0000-4000-8000-000000000001','authenticated','authenticated','cs-owner@example.com','',now(),'{}','{}',now(),now()),
  ('e1000000-0000-4000-8000-000000000002','authenticated','authenticated','cs-outsider@example.com','',now(),'{}','{}',now(),now());
insert into public.workspaces (id, name, created_by)
values ('e2000000-0000-4000-8000-000000000001','Canvas source workspace','e1000000-0000-4000-8000-000000000001');
insert into public.projects (id, workspace_id, name, created_by)
values ('e3000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','Canvas source project','e1000000-0000-4000-8000-000000000001');
insert into public.rooms (id, workspace_id, project_id, name, owner_id)
values ('e4000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001','Canvas source room','e1000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000001',true);

create temporary table created as
select public.create_canvas_screen(
  'e4000000-0000-4000-8000-000000000001', 'Today', 'react',
  '{"App.tsx":"export default function App(){return <main>Hi</main>}"}'::jsonb, 'App.tsx', 'mobile') as result;

select is((select state::text from public.design_screens where id = (select (result->>'screenId')::uuid from created)),
  'built', 'a created canvas screen is built');
select is((select form_factor from public.design_screens where id = (select (result->>'screenId')::uuid from created)),
  'mobile', 'the form factor is stored on the screen');
select is((select source_kind from public.design_screen_versions where id = (select (result->>'versionId')::uuid from created)),
  'react', 'the first version is a react source');
select is((select current_version_id from public.design_screens where id = (select (result->>'screenId')::uuid from created)),
  (select (result->>'versionId')::uuid from created), 'the first version is current');

-- H1: validate every link item and array shape without appending a version.
create temporary table before_invalid as
select count(*) as count from public.design_screen_versions
where screen_id=(select (result->>'screenId')::uuid from created);
select throws_ok($sql$
  select public.save_canvas_screen_version(s.id,s.current_version_id,
    '{"App.tsx":"invalid links"}'::jsonb,array[null]::text[])
  from public.design_screens s where s.id=(select (result->>'screenId')::uuid from created)
$sql$,'P0001','invalid_canvas_screen','rejects null item');
select throws_ok($sql$
  select public.save_canvas_screen_version(s.id,s.current_version_id,
    '{"App.tsx":"invalid links"}'::jsonb,array['UPPER'])
  from public.design_screens s where s.id=(select (result->>'screenId')::uuid from created)
$sql$,'P0001','invalid_canvas_screen','rejects upper case');
select throws_ok($sql$
  select public.save_canvas_screen_version(s.id,s.current_version_id,
    '{"App.tsx":"invalid links"}'::jsonb,array[''])
  from public.design_screens s where s.id=(select (result->>'screenId')::uuid from created)
$sql$,'P0001','invalid_canvas_screen','rejects empty item');
select throws_ok($sql$
  select public.save_canvas_screen_version(s.id,s.current_version_id,
    '{"App.tsx":"invalid links"}'::jsonb,array[repeat('a',65)])
  from public.design_screens s where s.id=(select (result->>'screenId')::uuid from created)
$sql$,'P0001','invalid_canvas_screen','rejects overlong item');
select throws_ok($sql$
  select public.save_canvas_screen_version(s.id,s.current_version_id,
    '{"App.tsx":"invalid links"}'::jsonb,array[E'target\n'])
  from public.design_screens s where s.id=(select (result->>'screenId')::uuid from created)
$sql$,'P0001','invalid_canvas_screen','rejects newline item');
select throws_ok($sql$
  select public.save_canvas_screen_version(s.id,s.current_version_id,
    '{"App.tsx":"invalid links"}'::jsonb,array_fill('target'::text,array[101]))
  from public.design_screens s where s.id=(select (result->>'screenId')::uuid from created)
$sql$,'P0001','invalid_canvas_screen','rejects 101 items');
select throws_ok($sql$
  select public.save_canvas_screen_version(s.id,s.current_version_id,
    '{"App.tsx":"invalid links"}'::jsonb,array[['one','two'],['three','four']])
  from public.design_screens s where s.id=(select (result->>'screenId')::uuid from created)
$sql$,'P0001','invalid_canvas_screen','rejects multidimensional array');
select is((select count(*) from public.design_screen_versions
  where screen_id=(select (result->>'screenId')::uuid from created)),
  (select count from before_invalid),'invalid links append no versions');
select is((select current_version_id from public.design_screens
  where id=(select (result->>'screenId')::uuid from created)),
  (select (result->>'versionId')::uuid from created),'invalid links leave head unchanged');

-- Use a separate screen so this busy test cannot mask the original save cases.
create temporary table busy as select public.create_canvas_screen(
  'e4000000-0000-4000-8000-000000000001','Busy','react',
  '{"App.tsx":"busy original"}','App.tsx','mobile') as result;
reset role;
update public.design_screens set updating=true
where id=(select (result->>'screenId')::uuid from busy);
set local role authenticated;
create temporary table blocked as select public.save_canvas_screen_version(
  (select (result->>'screenId')::uuid from busy),
  (select (result->>'versionId')::uuid from busy),'{"App.tsx":"manual edit"}') as result;
select is((select result->>'status' from blocked),'conflict','busy screen conflicts with matching base');
select is((select result->>'versionId' from blocked),
  (select result->>'versionId' from busy),'busy conflict returns current head');
select is((select count(*) from public.design_screen_versions
  where screen_id=(select (result->>'screenId')::uuid from busy)),1::bigint,'busy save appends no version');
select is((select current_version_id from public.design_screens
  where id=(select (result->>'screenId')::uuid from busy)),
  (select (result->>'versionId')::uuid from busy),'busy save does not advance head');
select ok((select updating from public.design_screens
  where id=(select (result->>'screenId')::uuid from busy)),'busy save preserves generation flag');
reset role;
update public.design_screens set updating=false
where id=(select (result->>'screenId')::uuid from busy);
set local role authenticated;
select is((select public.save_canvas_screen_version(
  (select (result->>'screenId')::uuid from busy),
  (select (result->>'versionId')::uuid from busy),'{"App.tsx":"manual edit"}')->>'status'),
  'saved','idle screen saves with the same matching base');

create temporary table deleted as select public.create_canvas_screen(
  'e4000000-0000-4000-8000-000000000001','Deleted','html',
  '{"index.html":"original"}','index.html','mobile') as result;
reset role;
update public.design_screens set deleted_at=now()
where id=(select (result->>'screenId')::uuid from deleted);
set local role authenticated;
select throws_ok($sql$
  select public.save_canvas_screen_version((result->>'screenId')::uuid,
    (result->>'versionId')::uuid,'{"index.html":"edit"}') from deleted
$sql$,'P0001','not_authorized','deleted screen cannot be saved');
select ok(not has_function_privilege('anon',
  'public.save_canvas_screen_version(uuid,uuid,jsonb,text[],text,text)','EXECUTE'),
  'anon cannot execute the save RPC');
select ok(has_function_privilege('authenticated',
  'public.save_canvas_screen_version(uuid,uuid,jsonb,text[],text,text)','EXECUTE'),
  'authenticated retains execute permission');

create temporary table saved as
select public.save_canvas_screen_version(
  (select (result->>'screenId')::uuid from created),
  (select (result->>'versionId')::uuid from created),
  '{"App.tsx":"export default function App(){return <main>Hello</main>}"}'::jsonb,
  array['settings']) as result;

select is((select result->>'status' from saved), 'saved', 'saving on the current version succeeds');
select is((select links from public.design_screen_versions where id = (select (result->>'versionId')::uuid from saved)),
  array['settings'], 'links are stored with the version');

select is((select public.save_canvas_screen_version(
  (select (result->>'screenId')::uuid from created),
  (select (result->>'versionId')::uuid from created),
  '{"App.tsx":"x"}'::jsonb) ->> 'status'), 'conflict', 'saving on a stale base is a conflict');

select throws_ok(
  $$ select public.create_canvas_screen('e4000000-0000-4000-8000-000000000001','Bad','react','{"App.tsx":"x"}'::jsonb,'Main.tsx','mobile') $$,
  'P0001', 'invalid_canvas_screen', 'the entry must be one of the files');

select throws_ok(
  $$ select public.create_canvas_screen('e4000000-0000-4000-8000-000000000001','Bad','react','{"../x.tsx":"x"}'::jsonb,'../x.tsx','mobile') $$,
  'P0001', 'invalid_canvas_screen', 'paths cannot climb out of the screen');

create temporary table restored as
select public.restore_screen_version(
  (select (result->>'screenId')::uuid from created),
  (select (result->>'versionId')::uuid from created)) as result;

select is((select files->>'App.tsx' from public.design_screen_versions where id = (select (result->>'versionId')::uuid from restored)),
  'export default function App(){return <main>Hi</main>}', 'restore copies the old files into a new current version');

create temporary table old_restored as
select (public.restore_design_screen_version(
  (select (result->>'screenId')::uuid from created),
  (select (result->>'versionId')::uuid from created))).id as version_id;

select results_eq(
  $$ select source_kind, files from public.design_screen_versions where id = (select version_id from old_restored) $$,
  $$ select source_kind, files from public.design_screen_versions where id = (select (result->>'versionId')::uuid from created) $$,
  'the older restore keeps a canvas screen source');

select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000002',true);
select throws_ok(
  $$ select public.create_canvas_screen('e4000000-0000-4000-8000-000000000001','Nope','html','{"index.html":"<p>x</p>"}'::jsonb,'index.html','desktop') $$,
  'P0001', 'not_authorized', 'an outsider cannot create a screen');
select throws_ok(
  format($$ select public.save_canvas_screen_version(%L::uuid, null, '{"App.tsx":"x"}'::jsonb) $$,
    (select result->>'screenId' from created)),
  'P0001', 'not_authorized', 'an outsider cannot save a version');

select * from finish();
rollback;
