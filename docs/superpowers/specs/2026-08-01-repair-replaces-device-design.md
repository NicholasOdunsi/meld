# Re-pair Replaces Device — Design (Bug A)

**Date:** 2026-08-01
**Status:** Approved (design), pending implementation
**Scope:** Fixes the "Waiting for your device" permanent hang caused by re-pairing.

## Problem

A room-reply task is pinned at creation time to the user's **default device**
(`ai_user_preferences.default_device_id`), and dispatch only ever runs it on that
exact `device_id` — there is no fallback to another connected device
(`list_dispatchable_ai_tasks`, `ai_tasks.sql:1446-1463`; `create_room_reply_task`,
`room_agent_messages.sql:195-214`).

Re-pairing the same Mac mints a **brand-new** `execution_devices` row with a new
id and overwrites the connector's stored credential, so the connector now
connects to the gateway **as the new device**. But the default preference is
**not** moved: `settle_provider_setup_request` only fills the default when it is
`NULL` (`provider_setup.sql:490-500`), and a bare re-pair never nulls it. The old
device is never revoked (`redeem_device_pairing_code`, `provider_setup.sql:608-666`).

Result: default stays pointed at the OLD device, which no connector presents
anymore. Every task pins to it and parks at `waiting_for_device` forever. Settings
also accumulates a duplicate "active" device row per re-pair.

Observed live: `ai_user_preferences.default_device_id` = the old device
(offline since 3:30 PM); the connector runs as a newer device; the stuck task is
pinned to the old device.

## Device model

**One Mac per user (single connector).** Re-pairing *replaces* the prior device.
A user is expected to have at most one active device at a time. (Confirmed with
the user; drives the fix below.)

## Root-cause insight driving the approach

The connector overwrites its credential and reconnects as the new device the
moment `pair` runs, so the old device id is **immediately abandoned** — no
process presents it. Therefore:

- Keeping the old device as default "until the new one is ready" buys nothing —
  the old device already has no live connector.
- Doing the swap at setup-completion would *keep the bug alive during the setup
  window*: a task created then would still pin to the old, dead default and hang.

So the correct point to replace the device is **at pair time** (`redeem`), which
also reuses machinery that is already correct:

- `revoke_execution_device` already nulls the default when it revokes the default
  device (`provider_setup.sql:736-741`) and cancels the device's open setup
  requests (`provider_setup.sql:720-728`).
- `settle_provider_setup_request` already refills a NULL default to the
  newly-set-up device (`provider_setup.sql:490-500`) — its guard was designed for
  exactly the "revoke-then-repair" sequence. The bug is only that a bare re-pair
  never triggered the revoke.

## Approach (chosen: A1, revoke-at-pair)

Make `redeem_device_pairing_code` revoke the user's other active device(s) as
part of redeeming a new pairing code — mirroring `revoke_execution_device`
inline (it cannot *call* that function, which keys on `auth.uid()`; redeem runs
credential-less and derives the user from `code_row.user_id`).

Rejected alternatives:
- **A1-at-settle** (revoke + unconditional default move in
  `settle_provider_setup_request`): more complex (inline revoke + request
  cleanup in settle, plus reworking settle's deliberate default guard), and
  leaves the hang reproducible during the setup window. Rejected.
- **A2 reuse device identity** (pairing reuses the existing device row / rotates
  token instead of minting a new uuid): structurally cleanest but rewrites the
  pairing/credential identity model — larger blast radius than this bug warrants.
- **A3 minimal (move default only, don't revoke)**: fixes the hang but leaves
  duplicate active-device rows in Settings. Rejected in favor of the clean
  single-active-device invariant.

## Change

A single new **forward migration** that `CREATE OR REPLACE`s
`redeem_device_pairing_code` (same signature). New behavior, added **before** the
new-device insert, scoped to `code_row.user_id`:

1. For every currently-active device belonging to `code_row.user_id`
   (`status = 'active' and revoked_at is null`):
   - `update execution_devices set status = 'revoked', revoked_at = coalesce(revoked_at, now())`
   - cancel its open `provider_setup_requests` (statuses
     `queued, dispatched, installing, authenticating, verifying` →
     `cancelled` / `error_code = 'cancelled'`), matching
     `revoke_execution_device`.
2. Null the default preference if it pointed at any now-revoked device:
   `update ai_user_preferences set default_device_id = null, default_provider = null
   where user_id = code_row.user_id and default_device_id is not null` — the
   both-or-neither check constraint requires clearing both columns together.
3. Insert the new device + its setup request (unchanged from today).

Everything downstream is unchanged: `settle_provider_setup_request` refills the
now-NULL default to the new device when its setup completes. Net invariant:
**at most one active device per user; the default always follows the newest
pairing; a task can never pin to an abandoned device.**

All ordering happens inside the single `redeem` transaction (it already takes
`for update` on the code row), so the revoke + insert are atomic.

## Behavior notes

- **Setup window:** between redeem and the new device settling, the default is
  NULL, so `create_room_reply_task` raises `invalid_room_reply_request`
  (`room_agent_messages.sql:201-203`) — a clean rejection, not a silent hang.
  Making the web surface show a friendly "your Mac is finishing setup" message
  for this specific case is an **optional UI follow-up**, out of scope here.
- **First-ever pairing** (no prior device): step 1 revokes nothing, default is
  already NULL, settle sets it — identical to today.
- **Re-running setup on the current device** is unaffected: it is not a new
  `redeem`, it is a `settle` on the existing device.

## Non-goals

- **Bug B — the launchd daemon vanishing** (`com.meld.agent` not staying loaded
  after a clean exit / re-pair). Confirmed as a state but not yet root-caused;
  gets its own systematic-debugging pass. Not in this change.
- No connector, gateway, or web/UI code changes for Bug A.
- No dispatch-fallback / multi-device routing (explicitly a single-Mac model).
- Cleaning up the user's *existing* stuck task and duplicate devices is a
  one-off operational step, separate from this forward fix.

## Testing

pgTAP, in `supabase/tests/device_pairing.test.sql` (house style: `select plan(N)`,
`throws_ok`, `lives_ok`, `is`, `ok`). Bump the plan count. New assertions:

1. **Re-pair revokes the prior active device.** Given a user with one active
   device that is the default, redeeming a second valid code:
   - the old device's `status` is now `revoked` and `revoked_at` is set;
   - the new device is `active`;
   - `ai_user_preferences.default_device_id` is now `NULL` (both columns cleared).
2. **Open setup requests on the revoked device are cancelled** (a `queued`
   request on the old device becomes `cancelled`).
3. **Then settle refills the default to the new device** (existing behavior; add
   an integration assertion in `provider_setup.test.sql` or extend the pairing
   test: after a successful `settle_provider_setup_request` on the new device,
   `default_device_id` = the new device).
4. **First-ever pairing still works** (no prior device → no error, default set on
   settle) — likely already covered; verify and keep green.

Run: the repo's `pnpm test:db` (`supabase test db` / pg_prove). Per the local
setup, tests can also be executed directly against the Dockerized Postgres
(`supabase_db_meld`) inside a rolled-back transaction — the plan will specify the
exact command used for verification.

## Risk

Low. One RPC body, additive behavior, reuses patterns already present in
`revoke_execution_device`. The main care points: order the revoke before the
insert, and null the default in the same transaction so `settle` can refill it.
