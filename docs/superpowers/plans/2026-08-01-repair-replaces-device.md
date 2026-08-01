# Re-pair Replaces Device Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop room-reply tasks from pinning to a dead device after a re-pair, by making `redeem_device_pairing_code` revoke the user's prior active device(s) and clear the stale default so the existing settle path refills it to the new device.

**Architecture:** Single-Mac model. One forward SQL migration that `CREATE OR REPLACE`s `redeem_device_pairing_code` (same signature) with a revoke-prior-devices block. No connector/gateway/web changes. Tested with pgTAP in `supabase/tests/device_pairing.test.sql`.

**Tech Stack:** PostgreSQL (Supabase), pgTAP, Dockerized local DB (`supabase_db_meld`).

## Global Constraints

- Signature of `redeem_device_pairing_code(text, uuid, text, text, text)` MUST stay unchanged (it's granted to `service_role` and called by the web pairing route).
- The revoke block runs **before** the new-device insert, all inside the existing `redeem` transaction.
- Clearing the default MUST clear **both** `default_device_id` and `default_provider` together (the `ai_user_preferences` both-or-neither check, `provider_setup.sql:99-102`).
- Mirror `revoke_execution_device` exactly for the device/request updates: `revoked_at = coalesce(revoked_at, now())`; cancel requests in statuses `queued, dispatched, installing, authenticating, verifying` with `error_code = 'cancelled'`, `completed_at = coalesce(completed_at, now())`.
- Do NOT change `settle_provider_setup_request` — its NULL-default refill (`provider_setup.sql:490-500`) is the intended other half and must keep working.
- New migration filename sorts after all existing ones: `supabase/migrations/202608010004_repair_replaces_device.sql`.

---

### Task 1: Migration + pgTAP test — re-pair revokes the prior device

**Files:**
- Create: `supabase/migrations/202608010004_repair_replaces_device.sql`
- Test: `supabase/tests/device_pairing.test.sql` (add fixtures + assertions; bump `plan()`)

**Interfaces:**
- Consumes: existing `redeem_device_pairing_code(text, uuid, text, text, text)`, `ai_user_preferences`, `provider_setup_requests`, `execution_devices`.
- Produces: same `redeem_device_pairing_code` signature; new post-condition — after redeeming a code for a user, that user's other `active` devices become `revoked`, their open setup requests become `cancelled`, and `ai_user_preferences` default is cleared.

- [ ] **Step 1: Add test fixtures to `device_pairing.test.sql`**

The existing "a live code is redeemed" test (owner `…0001`, code `repeat('9',64)` → new device `…0004`) already exercises "owner with an existing active device (`…0002`) redeems a new code." Add fixtures so we can assert the new revoke behavior against it.

After the `provider_connections` insert (currently ends at line 60), add:

```sql
-- Owner's saved default points at their current Mac, and that Mac has a live
-- setup request. Re-pairing (redeeming a new code below) must revoke the Mac,
-- cancel the request, and clear the default so settle can refill it.
insert into public.ai_user_preferences (
  user_id, default_device_id, default_provider
)
values (
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002',
  'codex'
);

insert into public.provider_setup_requests (
  user_id, device_id, provider, status
)
values (
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002',
  'codex', 'queued'
);
```

- [ ] **Step 2: Add the new assertions after the live redemption**

The live redemption happens at the current lines 223-231. Its post-conditions are checked around lines 251-285 under `reset role;`. Immediately after the existing `'redemption creates no provider connection'` assertion (currently ends line 285), add four assertions:

```sql
select is(
  (
    select status from public.execution_devices
    where id = '30000000-0000-4000-8000-000000000002'
  ),
  'revoked'::public.execution_device_status,
  're-pairing revokes the owner''s previous active device'
);

select ok(
  (
    select revoked_at is not null from public.execution_devices
    where id = '30000000-0000-4000-8000-000000000002'
  ),
  'the replaced device gets a revoked_at timestamp'
);

select is(
  (
    select default_device_id from public.ai_user_preferences
    where user_id = '10000000-0000-4000-8000-000000000001'
  ),
  null::uuid,
  're-pairing clears the stale default so settle can refill it'
);

select is(
  (
    select status from public.provider_setup_requests
    where device_id = '30000000-0000-4000-8000-000000000002'
      and provider = 'codex'
  ),
  'cancelled'::public.provider_setup_status,
  're-pairing cancels the replaced device''s open setup request'
);
```

- [ ] **Step 3: Bump the plan count**

Change `select plan(29);` (line 5) to `select plan(33);` (four new assertions).

- [ ] **Step 4: Run the test to verify it FAILS**

Run:
```bash
docker exec -i supabase_db_meld psql -U postgres -d postgres -v ON_ERROR_STOP=0 -f - \
  < supabase/tests/device_pairing.test.sql 2>&1 | grep -E "^(ok|not ok|# )" | tail -40
```
Expected: `not ok` on the new "re-pairing revokes…" assertions (device `…0002` is still `active`, default still set, request still `queued`) — and possibly a `not ok`/error earlier if the plan count mismatches. The revoke behavior does not exist yet.

- [ ] **Step 5: Create the migration with the new redeem body**

Create `supabase/migrations/202608010004_repair_replaces_device.sql` with the full function (existing body + the revoke block inserted after the `invalid_pairing_code` guard and before the `execution_devices` insert):

```sql
-- Single-Mac model: pairing a new device replaces the one the user already has.
-- redeem now revokes the user's prior active device(s) before inserting the new
-- one, which clears the stale default so settle_provider_setup_request refills it
-- to the new device. Without this, a re-pair left the default pointed at a device
-- the connector had already abandoned, and every room-reply task pinned to it hung
-- at 'waiting_for_device' forever.
create or replace function public.redeem_device_pairing_code(
  target_code_hash text,
  target_device_id uuid,
  target_token_hash text,
  target_platform text,
  target_name text
)
returns table (user_id uuid, requested_provider public.ai_provider)
language plpgsql
security definer
set search_path = ''
as $$
declare
  code_row public.device_pairing_codes;
begin
  select * into code_row
  from public.device_pairing_codes as code
  where code.code_hash = target_code_hash
  for update;

  if code_row.id is null
     or code_row.expires_at <= now()
     or code_row.redeemed_at is not null then
    raise exception 'invalid_pairing_code' using errcode = 'P0001';
  end if;

  -- Replace any device the user already has. The connector overwrites its stored
  -- credential on pair and reconnects as the new device, so prior devices are
  -- abandoned the instant this runs. Mirrors revoke_execution_device inline (we
  -- cannot call it: it keys on auth.uid() and this runs credential-less).
  update public.execution_devices
  set status = 'revoked',
      revoked_at = coalesce(revoked_at, now())
  where user_id = code_row.user_id
    and status = 'active'
    and revoked_at is null;

  update public.provider_setup_requests
  set status = 'cancelled',
      error_code = 'cancelled',
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
  where user_id = code_row.user_id
    and status in (
      'queued', 'dispatched', 'installing', 'authenticating', 'verifying'
    );

  -- A valid default always references an active device, so it pointed at one we
  -- just revoked. Clear both columns together for the both-or-neither check;
  -- settle refills them when the new device finishes setup.
  update public.ai_user_preferences
  set default_device_id = null,
      default_provider = null,
      updated_at = now()
  where user_id = code_row.user_id
    and default_device_id is not null;

  insert into public.execution_devices (
    id, user_id, name, platform, token_hash, status
  )
  values (
    target_device_id,
    code_row.user_id,
    left(coalesce(nullif(target_name, ''), 'Meld connector'), 100),
    left(target_platform, 50),
    target_token_hash,
    'active'
  );

  insert into public.provider_setup_requests (
    user_id, device_id, provider
  )
  values (
    code_row.user_id,
    target_device_id,
    code_row.requested_provider
  );

  update public.device_pairing_codes
  set redeemed_at = now(),
      redeemed_device_id = target_device_id
  where id = code_row.id;

  return query select code_row.user_id, code_row.requested_provider;
end;
$$;
```

- [ ] **Step 6: Apply the migration to the local DB**

Run:
```bash
docker exec -i supabase_db_meld psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - \
  < supabase/migrations/202608010004_repair_replaces_device.sql && echo APPLIED
```
Expected: `CREATE FUNCTION` then `APPLIED`.

- [ ] **Step 7: Run the test to verify it PASSES**

Run:
```bash
docker exec -i supabase_db_meld psql -U postgres -d postgres -v ON_ERROR_STOP=0 -f - \
  < supabase/tests/device_pairing.test.sql 2>&1 | grep -E "^(not ok|# (Looks|Failed))" || echo "ALL PASS"
```
Expected: `ALL PASS` (no `not ok`, pgTAP summary reports 33/33).

- [ ] **Step 8: Run adjacent pgTAP suites for regressions**

`redeem` is also referenced by other suites. Run each and confirm no `not ok`:
```bash
for f in provider_setup room_agent_messages ai_task_transitions tenant_isolation; do
  echo "== $f =="
  docker exec -i supabase_db_meld psql -U postgres -d postgres -v ON_ERROR_STOP=0 -f - \
    < supabase/tests/$f.test.sql 2>&1 | grep -E "^(not ok|# (Looks|Failed))" || echo "  ALL PASS"
done
```
Expected: `ALL PASS` for each. If a suite regresses because it assumed a user could keep multiple active devices across a redeem, fix that suite's expectation to the single-active-device invariant (do not weaken the migration).

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/202608010004_repair_replaces_device.sql supabase/tests/device_pairing.test.sql
git commit -m "fix(pairing): re-pair replaces the prior device so tasks stop pinning to a dead one"
```

---

## Self-Review

**Spec coverage:** Spec §Change step 1 (revoke active devices + cancel their requests) → migration `update execution_devices` + `update provider_setup_requests`, tested by assertions 1/2/4. Step 2 (null default) → migration `update ai_user_preferences`, tested by assertion 3. Step 3 (insert new device unchanged) → migration insert block, covered by existing redemption assertions (lines 251-285). Settle-refill (unchanged) → verified by Step 8 running `provider_setup.test.sql`. §Behavior "first-ever pairing still works" → existing suite covers a user redeeming with no prior default; Step 8 guards it. §Testing items 1-4 → Steps 1-3 assertions + Step 8.

**Placeholder scan:** None — full migration body and full test snippets included.

**Type consistency:** Function signature identical to the current definition (`text, uuid, text, text, text` → `table(user_id uuid, requested_provider public.ai_provider)`). Enum casts match schema: `public.execution_device_status`, `public.provider_setup_status`. Fixture UUIDs reuse existing fixture devices `…0001` and `…0002`.
