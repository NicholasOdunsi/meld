begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
('c1000000-0000-4000-8000-000000000001','authenticated','authenticated','star-owner@example.com','',now(),'{}','{}',now(),now()),
('c1000000-0000-4000-8000-000000000002','authenticated','authenticated','star-outsider@example.com','',now(),'{}','{}',now(),now());
insert into public.workspaces (id,name,created_by)
values ('c2000000-0000-4000-8000-000000000001','Star workspace','c1000000-0000-4000-8000-000000000001');
insert into public.projects (id,workspace_id,name,created_by)
values ('c3000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','Project','c1000000-0000-4000-8000-000000000001');
insert into public.rooms (id,workspace_id,project_id,name,owner_id)
values
('c4000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','Main','c1000000-0000-4000-8000-000000000001'),
('c4000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','Other','c1000000-0000-4000-8000-000000000001');
insert into public.execution_devices (id,user_id,name,platform,token_hash,status)
values ('c5000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','Mac','macos',repeat('f',64),'active');
insert into public.ai_tasks (id,initiating_user_id,workspace_id,room_id,device_id,provider,kind,status,instruction,context_manifest_json)
values
('c6000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000001','claude','room_reply','queued','First task','{}'),
('c6000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000002','c5000000-0000-4000-8000-000000000001','claude','room_reply','queued','Other task','{}');
insert into public.messages(id,room_id,client_id,author_type,author_id,body)
values ('c8000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001',
        'c9000000-0000-4000-8000-000000000001','human','c1000000-0000-4000-8000-000000000001','Follow up');

select ok(not has_table_privilege('anon','public.room_stars','SELECT'), 'anon cannot read stars');
select ok(not has_table_privilege('anon','public.room_constellations','INSERT'), 'anon cannot create constellations');
select ok(has_table_privilege('authenticated','public.room_stars','UPDATE'), 'authenticated role can edit authorized stars');
select ok(has_table_privilege('service_role','public.room_stars','UPDATE'), 'background title enrichment can update stars');

set local role authenticated;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
select lives_ok($$insert into public.room_constellations(id,room_id,name) values
  ('c7000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','Checkout')$$,
  'owner creates a constellation');
select lives_ok($$insert into public.room_stars(room_id,task_id,title,constellation_id) values
  ('c4000000-0000-4000-8000-000000000001','c6000000-0000-4000-8000-000000000001','Review checkout','c7000000-0000-4000-8000-000000000001')$$,
  'owner creates a star');
select is((select title from public.room_stars where task_id='c6000000-0000-4000-8000-000000000001'),
  'Review checkout','owner reads the star');
select lives_ok($$insert into public.room_stars(room_id,task_id,title) values
  ('c4000000-0000-4000-8000-000000000001','c6000000-0000-4000-8000-000000000001','Fallback')
  on conflict (task_id) do nothing$$,'fallback creation is idempotent');
with renamed as (
  update public.room_stars set title='Checkout review'
  where task_id='c6000000-0000-4000-8000-000000000001' returning 1)
select is((select count(*)::int from renamed),1,'owner rename updates the star row');
select is((select title from public.room_stars where task_id='c6000000-0000-4000-8000-000000000001'),
  'Checkout review','the star title actually changed');
select throws_ok($$insert into public.room_stars(room_id,task_id,title) values
  ('c4000000-0000-4000-8000-000000000001','c6000000-0000-4000-8000-000000000002','Wrong room')$$,
  '23503',null,'a task cannot be attached to another room');
select lives_ok($$insert into public.room_star_followups(room_id,star_task_id,message_id) values
  ('c4000000-0000-4000-8000-000000000001','c6000000-0000-4000-8000-000000000001','c8000000-0000-4000-8000-000000000001')$$,
  'owner links a follow-up in the same room');
select is((select count(*)::int from public.room_star_followups),1,'owner reads the linked follow-up');

select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000002',true);
select is((select count(*)::int from public.room_stars),0,'outsider sees no stars');
select is((select count(*)::int from public.room_constellations),0,'outsider sees no constellations');
select is((select count(*)::int from public.room_star_followups),0,'outsider sees no follow-ups');
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000002',true);
with renamed as (
  update public.room_stars set title='Hijacked'
  where task_id='c6000000-0000-4000-8000-000000000001' returning 1)
select is((select count(*)::int from renamed),0,'outsider rename updates zero rows');
with moved as (
  update public.room_stars set constellation_id=null
  where task_id='c6000000-0000-4000-8000-000000000001' returning 1)
select is((select count(*)::int from moved),0,'outsider move updates zero rows');
reset role;
select is((select title from public.room_stars where task_id='c6000000-0000-4000-8000-000000000001'),
  'Checkout review','outsider updates left the star title unchanged');
select is((select constellation_id from public.room_stars where task_id='c6000000-0000-4000-8000-000000000001'),
  'c7000000-0000-4000-8000-000000000001'::uuid,'outsider updates left the star in its constellation');
set local role authenticated;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000002',true);
select throws_ok($$insert into public.room_constellations(room_id,name) values
  ('c4000000-0000-4000-8000-000000000001','Stolen')$$,
  '42501',null,'outsider cannot create a constellation');

select * from finish();
rollback;
