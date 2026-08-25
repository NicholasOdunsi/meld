-- Chain state on a generation, and the trigger-safe task creator that queues
-- the next link. `create_design_screen_generate_task` reads `auth.uid()` and
-- refuses when there is none -- but the chain is queued from inside a
-- database trigger, where there is no JWT. Fixtures mirror
-- `design_screen_batch_materialize.test.sql`.

begin;

create extension if not exists pgtap with schema extensions;

select plan(32);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('c1000000-0000-4000-8000-000000000001','authenticated','authenticated','chain-owner@example.com','',now(),'{}','{}',now(),now()),
  ('c1000000-0000-4000-8000-000000000002','authenticated','authenticated','chain-editor@example.com','',now(),'{}','{}',now(),now());

insert into public.workspaces (id, name, created_by)
values (
  'c2000000-0000-4000-8000-000000000001',
  'Chain Workspace',
  'c1000000-0000-4000-8000-000000000001'
);
insert into public.projects (id, workspace_id, name, created_by)
values (
  'c3000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001',
  'Chain Project',
  'c1000000-0000-4000-8000-000000000001'
);
insert into public.memberships (workspace_id, user_id, role)
values ('c2000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000002','member');
insert into public.rooms (id, workspace_id, project_id, name, owner_id)
values (
  'c4000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001',
  'c3000000-0000-4000-8000-000000000001',
  'Chain Room',
  'c1000000-0000-4000-8000-000000000001'
);
insert into public.room_participants (room_id, user_id, access, added_by)
values ('c4000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000002','edit','c1000000-0000-4000-8000-000000000001');

insert into public.design_screens (
  id, room_id, workspace_id, name, created_by
)
values (
  'c5000000-0000-4000-8000-000000000001',
  'c4000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001',
  'Screen A',
  'c1000000-0000-4000-8000-000000000002'
);

insert into public.design_screens (id, room_id, workspace_id, name, created_by)
values
  ('c5000000-0000-4000-8000-000000000002','c4000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','Screen Two','c1000000-0000-4000-8000-000000000002'),
  ('c5000000-0000-4000-8000-000000000003','c4000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','Screen Three','c1000000-0000-4000-8000-000000000002'),
  ('c5000000-0000-4000-8000-000000000004','c4000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','Screen Four','c1000000-0000-4000-8000-000000000002');

-- For I1: a first-run frozen list must drop a key a LIVE screen owns, but
-- keep one a soft-deleted screen owns -- a screen the person deleted should
-- still be reachable by a later batch that links to its old key.
insert into public.design_screens (id, room_id, workspace_id, name, screen_key, created_by)
values
  ('c5000000-0000-4000-8000-000000000005','c4000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','Screen Five',null,'c1000000-0000-4000-8000-000000000002'),
  ('c5000000-0000-4000-8000-000000000006','c4000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','Live Owner','live_owned','c1000000-0000-4000-8000-000000000002');
insert into public.design_screens (id, room_id, workspace_id, name, screen_key, deleted_at, created_by)
values
  ('c5000000-0000-4000-8000-000000000007','c4000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','Deleted Owner','deleted_owned',now(),'c1000000-0000-4000-8000-000000000002');

-- For C1 (a follow-up inherits its parent's context blocks) and for the
-- intent gate (a single-screen build must not root a chain).
insert into public.design_screens (id, room_id, workspace_id, name, created_by)
values
  ('c5000000-0000-4000-8000-000000000008','c4000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','Screen Eight','c1000000-0000-4000-8000-000000000002'),
  ('c5000000-0000-4000-8000-000000000009','c4000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','Screen Nine','c1000000-0000-4000-8000-000000000002');

insert into public.execution_devices (
  id, user_id, name, platform, token_hash, status
)
values
  ('c6000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000002','Editor Mac','macos',repeat('c',64),'active'),
  -- Someone else's laptop, live and connected -- used to prove the queue
  -- checks WHOSE device it is, not merely that a live device exists.
  ('c6000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','Owner Mac','macos',repeat('d',64),'active');
insert into public.provider_connections (
  user_id, device_id, provider, installation, authentication, compatibility
)
values
  ('c1000000-0000-4000-8000-000000000002','c6000000-0000-4000-8000-000000000002','codex','installed','authenticated','supported'),
  ('c1000000-0000-4000-8000-000000000001','c6000000-0000-4000-8000-000000000001','codex','installed','authenticated','supported');
insert into public.ai_user_preferences (
  user_id, default_device_id, default_provider
)
values ('c1000000-0000-4000-8000-000000000002','c6000000-0000-4000-8000-000000000002','codex');

select has_column('public'::name, 'design_screen_generations'::name, 'chain_id'::name,
  'design_screen_generations.chain_id exists');
select has_column('public'::name, 'design_screen_generations'::name, 'chain_remaining'::name,
  'design_screen_generations.chain_remaining exists');
select has_column('public'::name, 'design_screen_generations'::name, 'chain_step'::name,
  'design_screen_generations.chain_step exists');
select has_column('public'::name, 'design_screen_generations'::name, 'chain_total'::name,
  'design_screen_generations.chain_total exists');

-- A parent task to chain from.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000002', true);
select public.create_design_screen_generate_task('c5000000-0000-4000-8000-000000000001');
reset role;

create temporary table parent as
select task_id from public.design_screen_generations
where screen_id = 'c5000000-0000-4000-8000-000000000001';

-- Make the fixture discriminating: give the parent a model that
-- `ai_user_preferences` could never produce (it carries no model column at
-- all). If the function ever re-derived provider/model/device from
-- preferences instead of copying the parent row, this value would come back
-- null and the inheritance assertion below would catch it.
update public.ai_tasks
set model = 'claude-sonnet-4-5'
where id = (select task_id from parent);

-- The queue function creates the next link.
create temporary table child as
select public.queue_design_screen_chain_step(
  (select task_id from parent), array['verify_docs','activate']
) as task_id;

select isnt((select task_id from child), null,
  'queue_design_screen_chain_step returns a new task id');

-- This parent was created without an instruction, so it carries the RPC's
-- one-line default and has no blank line -- no context blocks to inherit,
-- and the directive stands on its own.
select is(
  (select instruction from public.ai_tasks where id = (select task_id from child)),
  'build these screens for the flow: verify_docs, activate',
  'a parent with no context blocks leaves the directive standing alone'
);

-- Inheritance, not re-derivation: a chain started on one model stays on it.
select is(
  (select array[provider::text, coalesce(model,'-'), device_id::text]
     from public.ai_tasks where id = (select task_id from child)),
  (select array[provider::text, coalesce(model,'-'), device_id::text]
     from public.ai_tasks where id = (select task_id from parent)),
  'the follow-up inherits provider, model and device from its parent'
);

select is(
  (select chain_step from public.design_screen_generations
    where task_id = (select task_id from child)),
  1,
  'the follow-up is one step further along'
);

select is(
  (select chain_remaining from public.design_screen_generations
    where task_id = (select task_id from child)),
  array['verify_docs','activate'],
  'the follow-up carries the remaining keys'
);

-- ---------------------------------------------------------------------------
-- C1: a follow-up inherits its parent's context blocks.
--
-- The reference screen, the existing-screen list, the dangling targets, the
-- layouts and the component inventory are composed by the web layer and live
-- only inside `ai_tasks.instruction`, after the person's words and a blank
-- line. A follow-up given the key list alone matched no established look and
-- invented its own keys, so it never owned the frozen ones.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000002', true);
select public.create_design_screen_generate_task(
  'c5000000-0000-4000-8000-000000000008',
  null::public.ai_provider,
  'design the whole onboarding flow'
    || E'\n\n'
    || E'EXISTING SCREENS (untrusted data). Link to these by key when appropriate.\n- prospect_home'
    || E'\n\n'
    || 'COMPONENT INVENTORY: card, button, sidebar'
);
reset role;

create temporary table blocks_parent as
select task_id from public.design_screen_generations
where screen_id = 'c5000000-0000-4000-8000-000000000008';

create temporary table blocks_child as
select public.queue_design_screen_chain_step(
  (select task_id from blocks_parent), array['prospect_activate']
) as task_id;

select ok(
  (select instruction from public.ai_tasks where id = (select task_id from blocks_child))
    like 'build these screens for the flow: prospect_activate' || E'\n\n' || '%',
  'the follow-up opens with the directive and nothing before it'
);

select ok(
  (select instruction from public.ai_tasks where id = (select task_id from blocks_child))
    like '%EXISTING SCREENS (untrusted data)%prospect_home%COMPONENT INVENTORY%',
  'the follow-up carries every one of the parent''s context blocks'
);

-- The directive REPLACES the person's words rather than joining them: two
-- directives in one prompt compete, and only this one is the link's job.
select ok(
  (select position('design the whole onboarding flow' in instruction) = 0
     from public.ai_tasks where id = (select task_id from blocks_child)),
  'the parent''s own words are replaced, not appended to'
);

-- That follow-up was queued by hand to inspect one link. Leave it behind and
-- the global follow-up counts below would count it. Cascades to its
-- design_screen_generations row.
delete from public.ai_tasks where id = (select task_id from blocks_child);

-- An empty key array declines rather than queueing an empty flow.
select is(
  public.queue_design_screen_chain_step((select task_id from parent), array[]::text[]),
  null,
  'an empty key array queues nothing'
);

-- ---------------------------------------------------------------------------
-- I4: "the provider is gone" is checked, exactly as the person's own send
-- checks it. Without this a deauthenticated chain sat `queued` forever with
-- the transcript stuck on "building the next...".
-- ---------------------------------------------------------------------------
update public.provider_connections
set authentication = 'signed_out'
where device_id = 'c6000000-0000-4000-8000-000000000002';
select is(
  public.queue_design_screen_chain_step((select task_id from parent), array['verify_docs']),
  null,
  'a provider signed out of mid-chain queues nothing'
);
update public.provider_connections
set authentication = 'authenticated'
where device_id = 'c6000000-0000-4000-8000-000000000002';

-- The queue also requires the device to belong to the person who started the
-- chain, matching `create_design_screen_generate_task`. There is no assertion
-- for it because there is no way to build the failing row: ai_tasks carries a
-- composite foreign key (device_id, initiating_user_id) into execution_devices,
-- so a task pointing at someone else's laptop cannot be inserted at all. The
-- predicate is kept so the two functions read the same.

-- A device that has since been revoked ends the chain quietly.
update public.execution_devices
set revoked_at = now()
where id = 'c6000000-0000-4000-8000-000000000002';
select is(
  public.queue_design_screen_chain_step((select task_id from parent), array['verify_docs']),
  null,
  'a revoked device queues nothing'
);
update public.execution_devices
set revoked_at = null
where id = 'c6000000-0000-4000-8000-000000000002';

-- The ceiling -- asserted with the device live again, so the ceiling is the
-- only thing that can be declining.
update public.design_screen_generations
set chain_step = 3 where task_id = (select task_id from parent);
select is(
  public.queue_design_screen_chain_step((select task_id from parent), array['x']),
  null,
  'a parent at step 3 queues nothing -- three follow-ups, four runs in total'
);

-- The scenario above called `queue_design_screen_chain_step` directly to
-- prove what one follow-up looks like, leaving a manually-made follow-up
-- task (`child`, at chain_step 1) that never runs. The tests below assert on
-- global counts and on `chain_step = 1` being unique to the run they queue,
-- so that leftover row would make both false without ever being a real bug --
-- delete it. Cascades to its design_screen_generations row.
delete from public.ai_tasks where id = (select task_id from child);

-- A completed first run with unbuilt targets queues exactly one follow-up.
-- Two screens, because a flow request is what roots a chain: a run that
-- writes a single version is a single-screen build and is gated out below.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000002', true);
select public.create_design_screen_generate_task('c5000000-0000-4000-8000-000000000002');
reset role;

create temporary table run1 as
select task_id from public.design_screen_generations
where screen_id = 'c5000000-0000-4000-8000-000000000002';

update public.ai_tasks
set status = 'completed',
    result_json = '{
      "partial": false,
      "payload": {"screens": [
        {
          "screenKey": "home",
          "markup": "<main>Home</main>",
          "styles": "main{display:block}",
          "script": null,
          "actions": [
            {"id": "a", "label": "Verify", "targetScreenKey": "verify_docs"},
            {"id": "b", "label": "Done", "targetScreenKey": "activate"}
          ]
        },
        {
          "screenKey": "signin",
          "markup": "<main>Sign in</main>",
          "styles": "main{display:block}",
          "script": null,
          "actions": []
        }
      ]}
    }'
where id = (select task_id from run1);

select is(
  (select count(*)::integer from public.ai_tasks
    where kind = 'design_screen_generate'
      and instruction like 'build these screens for the flow:%'),
  1,
  'a completed run with unbuilt targets queues exactly one follow-up'
);

select is(
  (select chain_remaining from public.design_screen_generations
    where chain_step = 1),
  array['activate','verify_docs'],
  'the follow-up carries the keys the run linked to but did not build'
);

-- A run that builds everything it linked to queues nothing.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000002', true);
select public.create_design_screen_generate_task('c5000000-0000-4000-8000-000000000003');
reset role;

update public.ai_tasks
set status = 'completed',
    result_json = '{
      "partial": false,
      "payload": {"screens": [
        {
          "screenKey": "solo",
          "markup": "<main>Solo</main>",
          "styles": "main{display:block}",
          "script": null,
          "actions": []
        },
        {
          "screenKey": "solo_two",
          "markup": "<main>Solo Two</main>",
          "styles": "main{display:block}",
          "script": null,
          "actions": []
        }
      ]}
    }'
where id = (select task_id from public.design_screen_generations
            where screen_id = 'c5000000-0000-4000-8000-000000000003');

select is(
  (select count(*)::integer from public.ai_tasks
    where kind = 'design_screen_generate'
      and instruction like 'build these screens for the flow:%'),
  1,
  'a run with nothing left over queues nothing'
);

-- A failed run queues nothing. Only `completed` chains.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000002', true);
select public.create_design_screen_generate_task('c5000000-0000-4000-8000-000000000004');
reset role;

update public.ai_tasks
set status = 'failed'
where id = (select task_id from public.design_screen_generations
            where screen_id = 'c5000000-0000-4000-8000-000000000004');

select is(
  (select count(*)::integer from public.ai_tasks
    where kind = 'design_screen_generate'
      and instruction like 'build these screens for the flow:%'),
  1,
  'a failed run queues nothing -- the chain stops, earlier screens stay'
);

-- ---------------------------------------------------------------------------
-- The first-run frozen list drops a key a LIVE screen owns, but keeps one a
-- soft-deleted screen owns.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000002', true);
select public.create_design_screen_generate_task('c5000000-0000-4000-8000-000000000005');
reset role;

create temporary table owner_filter_run as
select task_id from public.design_screen_generations
where screen_id = 'c5000000-0000-4000-8000-000000000005';

update public.ai_tasks
set status = 'completed',
    result_json = '{
      "partial": false,
      "payload": {"screens": [
        {
          "screenKey": "landing",
          "markup": "<main>Landing</main>",
          "styles": "main{display:block}",
          "script": null,
          "actions": [
            {"id": "a", "label": "Unowned", "targetScreenKey": "unowned_key"},
            {"id": "b", "label": "Live", "targetScreenKey": "live_owned"},
            {"id": "c", "label": "Deleted", "targetScreenKey": "deleted_owned"}
          ]
        },
        {
          "screenKey": "landing_two",
          "markup": "<main>Landing Two</main>",
          "styles": "main{display:block}",
          "script": null,
          "actions": []
        }
      ]}
    }'
where id = (select task_id from owner_filter_run);

select is(
  (select chain_remaining from public.design_screen_generations
    where chain_id = (select task_id from owner_filter_run) and chain_step = 1),
  array['deleted_owned','unowned_key'],
  'the frozen list drops a key a live screen owns but keeps one a soft-deleted screen owns'
);

-- ---------------------------------------------------------------------------
-- The intent gate: only a flow request roots a chain.
--
-- A "tweak this button" edit whose markup links to a key nothing owns yet
-- used to queue up to three extra model runs and drop placeholder screens on
-- the canvas -- and since editing five selected screens fans out to five
-- tasks, one send could cost fifteen runs nobody asked for.
-- ---------------------------------------------------------------------------
-- Screen Two now holds a version, so a second run against it is an edit:
-- `base_version_id` is non-null. It writes two versions and names an unbuilt
-- key, so nothing but the edit signal can be declining it.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000002', true);
select public.create_design_screen_generate_task('c5000000-0000-4000-8000-000000000002');
reset role;

create temporary table edit_run as
select task_id, base_version_id from public.design_screen_generations
where screen_id = 'c5000000-0000-4000-8000-000000000002'
  and task_id <> (select task_id from run1);

select isnt(
  (select base_version_id from edit_run), null,
  'the fixture really is an edit -- it pins a base version'
);

update public.ai_tasks
set status = 'completed',
    result_json = '{
      "partial": false,
      "payload": {"screens": [
        {
          "screenKey": "home",
          "markup": "<main>Home v2</main>",
          "styles": "main{display:block}",
          "script": null,
          "actions": [
            {"id": "a", "label": "Elsewhere", "targetScreenKey": "edit_dangling_key"}
          ]
        },
        {
          "screenKey": "signin",
          "markup": "<main>Sign in v2</main>",
          "styles": "main{display:block}",
          "script": null,
          "actions": []
        }
      ]}
    }'
where id = (select task_id from edit_run);

select is(
  (select count(*)::integer from public.design_screen_generations
    where chain_id = (select task_id from edit_run)),
  0,
  'an edit that links to an unbuilt key starts no chain'
);

-- A single-screen build never reached the prompt's four-screen cap, so there
-- is no rest of the flow to go and fetch.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000002', true);
select public.create_design_screen_generate_task('c5000000-0000-4000-8000-000000000009');
reset role;

create temporary table single_run as
select task_id from public.design_screen_generations
where screen_id = 'c5000000-0000-4000-8000-000000000009';

update public.ai_tasks
set status = 'completed',
    result_json = '{
      "partial": false,
      "payload": {"screens": [{
        "screenKey": "solo_build",
        "markup": "<main>Solo build</main>",
        "styles": "main{display:block}",
        "script": null,
        "actions": [
          {"id": "a", "label": "Onward", "targetScreenKey": "solo_dangling_key"}
        ]
      }]}
    }'
where id = (select task_id from single_run);

select is(
  (select count(*)::integer from public.design_screen_generations
    where chain_id = (select task_id from single_run)),
  0,
  'a single-screen build that links to an unbuilt key starts no chain'
);

-- ---------------------------------------------------------------------------
-- chain_id and chain_total are frozen by the first run and inherited whole.
-- ---------------------------------------------------------------------------
select is(
  (select array[chain_id::text, chain_total::text] from public.design_screen_generations
    where task_id = (select task_id from run1)),
  array[(select task_id from run1)::text, '4'],
  'run 1 freezes its own chain_id and chain_total (2 built + 2 named-unbuilt)'
);

create temporary table run1_followup as
select task_id from public.design_screen_generations
where chain_id = (select task_id from run1) and chain_step = 1;

select is(
  (select chain_total from public.design_screen_generations
    where task_id = (select task_id from run1_followup)),
  4,
  'the follow-up inherits run 1''s frozen chain_total unchanged'
);

-- Builds one of the two remaining keys ("activate") and names a brand new
-- third key ("settings") that was never part of the frozen list. It writes a
-- single version, which also proves the intent gate is applied to the
-- decision to START a chain only -- a follow-up with one screen left is
-- normal and must keep chaining.
update public.ai_tasks
set status = 'completed',
    result_json = '{
      "partial": false,
      "payload": {"screens": [{
        "screenKey": "activate",
        "markup": "<main>Activate</main>",
        "styles": "main{display:block}",
        "script": null,
        "actions": [
          {"id": "a", "label": "Settings", "targetScreenKey": "settings"}
        ]
      }]}
    }'
where id = (select task_id from run1_followup);

select is(
  (select chain_remaining from public.design_screen_generations
    where chain_id = (select task_id from run1) and chain_step = 2),
  array['verify_docs'],
  'a one-screen follow-up still chains, and carries only the key still unbuilt'
);

-- ---------------------------------------------------------------------------
-- A completed run whose elements are all malformed writes no versions.
-- On a follow-up, `chain_remaining` is already non-empty, so without gating
-- on "this run actually wrote a version" the chain block would queue a
-- sibling at the same chain_step -- the ceiling bounds depth, not breadth.
-- Exercised at chain_step 2 (below the ceiling), and replayed once to prove
-- the fix is idempotent, not just first-invocation-lucky.
-- ---------------------------------------------------------------------------
create temporary table run1_followup2 as
select task_id, screen_id from public.design_screen_generations
where chain_id = (select task_id from run1) and chain_step = 2;

update public.ai_tasks
set status = 'completed',
    result_json = '{
      "partial": false,
      "payload": {"screens": [{"markup": 123, "actions": []}]}
    }'
where id = (select task_id from run1_followup2);

select is(
  (select count(*)::integer from public.design_screen_generations
    where chain_id = (select task_id from run1) and chain_step = 3),
  0,
  'a completed run that writes no versions queues no sibling at the same step'
);

update public.ai_tasks set updated_at = now()
where id = (select task_id from run1_followup2);

select is(
  (select count(*)::integer from public.design_screen_generations
    where chain_id = (select task_id from run1) and chain_step = 3),
  0,
  'replaying that same version-less completion still queues no sibling'
);

-- ---------------------------------------------------------------------------
-- I3: a link that ends without writing anything retires its placeholder.
--
-- `queue_design_screen_chain_step` puts an empty screen on the canvas with
-- `updating = true`, and only a written version ever clears that -- so a
-- link that fails, is cancelled, or returns an unusable batch left a nameless
-- tile spinning forever, up to three per chain, put there by the system
-- rather than by the person.
-- ---------------------------------------------------------------------------
select is(
  (select array[(deleted_at is not null)::text, updating::text]
     from public.design_screens
     where id = (select screen_id from run1_followup2)),
  array['true','false'],
  'a link that completes with an unusable batch retires its placeholder and stops the spinner'
);

create temporary table owner_followup as
select task_id, screen_id from public.design_screen_generations
where chain_id = (select task_id from owner_filter_run) and chain_step = 1;

update public.ai_tasks
set status = 'failed'
where id = (select task_id from owner_followup);

select is(
  (select array[(deleted_at is not null)::text, updating::text]
     from public.design_screens
     where id = (select screen_id from owner_followup)),
  array['true','false'],
  'a failed link retires its placeholder too'
);

-- Never a screen the person made. Screen Four's run failed at chain_step 0 --
-- that screen existed before any of this and stays exactly where it was.
select is(
  (select deleted_at from public.design_screens
    where id = 'c5000000-0000-4000-8000-000000000004'),
  null,
  'a failed run the person started leaves their own screen alone'
);

select * from finish();
rollback;
