begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select ok(to_regclass('public.design_proposal_handoffs') is not null,
  'handoff mapping exists');
select has_function('public', 'start_design_proposal', array['uuid', 'text']);
select ok(
  (select relrowsecurity from pg_catalog.pg_class
   where oid = 'public.design_proposal_handoffs'::regclass),
  'handoff mapping has row level security enabled'
);
select throws_ok(
  $$ select public.start_design_proposal('11111111-1111-4111-8111-111111111111', 'brief') $$,
  'P0001', 'Authentication required',
  'an anonymous caller cannot start a proposal'
);

select * from finish();
rollback;
