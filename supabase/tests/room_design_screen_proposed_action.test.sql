begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select ok(public.room_proposed_action_shape_ok(
  '{"kind":"design_screen","instruction":"A fintech balance screen","name":null,"screenId":null}'::jsonb),
  'design_screen with null name and screenId is accepted');
select ok(public.room_proposed_action_shape_ok(
  '{"kind":"design_screen","instruction":"Update it","name":"Balance","screenId":"11111111-1111-4111-8111-111111111111"}'::jsonb),
  'design_screen with a name and an existing screen id is accepted');
select ok(not public.room_proposed_action_shape_ok(
  '{"kind":"design_screen","instruction":"x","name":null,"screenId":null,"extra":1}'::jsonb),
  'an extra key is rejected');
select ok(not public.room_proposed_action_shape_ok(
  '{"kind":"design_screen","instruction":"   ","name":null,"screenId":null}'::jsonb),
  'a blank instruction is rejected');
select ok(not public.room_proposed_action_shape_ok(
  '{"kind":"design_screen","instruction":"x","name":null,"screenId":"not-a-uuid"}'::jsonb),
  'a malformed screen id is rejected');
select ok(not public.room_proposed_action_shape_ok(
  '{"kind":"design_screen","instruction":"x"}'::jsonb),
  'missing name and screenId keys are rejected');
select ok(public.room_proposed_action_shape_ok('{"kind":"prd_generate"}'::jsonb),
  'prd_generate still accepted');
select ok(not public.room_proposed_action_shape_ok('{"kind":"task_create"}'::jsonb),
  'unknown kinds are still rejected');

select * from finish();
rollback;
