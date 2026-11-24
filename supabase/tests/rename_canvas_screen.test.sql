begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('e5100000-0000-4000-8000-000000000001','authenticated','authenticated','rn-owner@example.com','',now(),'{}','{}',now(),now()),
  ('e5100000-0000-4000-8000-000000000002','authenticated','authenticated','rn-outsider@example.com','',now(),'{}','{}',now(),now());
insert into public.workspaces (id, name, created_by)
values ('e5200000-0000-4000-8000-000000000001','Rename workspace','e5100000-0000-4000-8000-000000000001');
insert into public.projects (id, workspace_id, name, created_by)
values ('e5300000-0000-4000-8000-000000000001','e5200000-0000-4000-8000-000000000001','Rename project','e5100000-0000-4000-8000-000000000001');
insert into public.rooms (id, workspace_id, project_id, name, owner_id)
values ('e5400000-0000-4000-8000-000000000001','e5200000-0000-4000-8000-000000000001','e5300000-0000-4000-8000-000000000001','Rename room','e5100000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub','e5100000-0000-4000-8000-000000000001',true);

create temporary table created as
select public.create_canvas_screen(
  'e5400000-0000-4000-8000-000000000001', 'New screen', 'html',
  '{"index.html":"<p>Hi</p>"}'::jsonb, 'index.html', 'mobile') as result;

select is(public.rename_canvas_screen((select (result->>'screenId')::uuid from created), 'New screen', '  VeloX Bike Shop  ')->>'status',
  'renamed', 'renames a screen that still has the placeholder name');
select is((select name from public.design_screens where id = (select (result->>'screenId')::uuid from created)),
  'VeloX Bike Shop', 'the new name is trimmed and saved');
select is(public.rename_canvas_screen((select (result->>'screenId')::uuid from created), 'New screen', 'Something else')->>'status',
  'unchanged', 'does not overwrite a name that is no longer the placeholder');
select is((select name from public.design_screens where id = (select (result->>'screenId')::uuid from created)),
  'VeloX Bike Shop', 'the earlier name is kept');
select throws_ok($sql$
  select public.rename_canvas_screen((select (result->>'screenId')::uuid from created), 'VeloX Bike Shop', '   ')
$sql$, 'P0001', 'invalid_screen_name', 'rejects a blank name');
select throws_ok($sql$
  select public.rename_canvas_screen((select (result->>'screenId')::uuid from created), 'VeloX Bike Shop', repeat('a', 121))
$sql$, 'P0001', 'invalid_screen_name', 'rejects an overlong name');

select set_config('request.jwt.claim.sub','e5100000-0000-4000-8000-000000000002',true);
select throws_ok($sql$
  select public.rename_canvas_screen((select (result->>'screenId')::uuid from created), 'VeloX Bike Shop', 'Hijacked')
$sql$, 'P0001', 'not_authorized', 'a user who cannot edit the room cannot rename');

reset role;
select is((select name from public.design_screens where id = (select (result->>'screenId')::uuid from created)),
  'VeloX Bike Shop', 'the outsider changed nothing');

select * from finish();
rollback;
