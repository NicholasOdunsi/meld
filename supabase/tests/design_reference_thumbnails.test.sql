begin;
select plan(2);
select is(
  (select public from storage.buckets where id = 'design-reference-thumbnails'),
  false, 'thumbnail bucket exists and is private'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
          and qual like '%design-reference-thumbnails%'),
  'thumbnail bucket has a participant RLS policy'
);
select * from finish();
rollback;
