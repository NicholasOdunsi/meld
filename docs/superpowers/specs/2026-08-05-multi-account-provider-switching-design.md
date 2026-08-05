# Multi-Account Provider Switching — Design

**Date:** 2026-08-05
**Status:** Approved for planning
**Author:** brainstorming session (Nicholas Odunsi)

## Problem

A device can authenticate exactly one account per provider (Claude/Codex) today. Once a
Claude account is signed in, there is no way to add, switch to, or log out a *different*
account on the same device:

- The connector's `authenticate()` short-circuits when *any* account is already signed in
  (`apps/connector/src/providers/provider-setup.ts:347-352`), so clicking "Connect Claude"
  again never opens a login window.
- There is no logout / disconnect / switch-account path anywhere in the web app or connector.
- The per-account credential folder is written once and never cleared.
- When an account hits its usage limit, the app detects it (`usage_limit_reached`) and shows a
  "Fix connection" banner that dead-ends back into the same re-verify flow.

Concrete user impact: a user with two Claude accounts whose first account hit its usage limit
cannot switch to the second account without uninstalling the connector.

## Goal

Let a single device hold **multiple authenticated accounts per provider** and switch which one
is **active**, driven from the web UI. Generic across providers (Claude now, Codex for free).
Manual switching only — automatic failover is explicitly out of scope (future work).

## Core Model

**Accounts are labeled slots.** Each connected account is a slot with:
- a generated `account_id` (uuid),
- a user-provided `label` (e.g. "Work", "Personal") — we *cannot* auto-detect identity
  (Claude's `auth status` exposes only `authMethod`/`subscriptionType` plus a secret token the
  app deliberately never reads; Codex exposes nothing identifying),
- its own isolated credential folder on the connector:
  `providers/<provider>/accounts/<account_id>/home`.

Both accounts stay signed in simultaneously; the folders don't collide (the app already isolates
per-provider — this adds one level).

**The database is the source of truth for "active" — the connector holds no active-state.**
- Switching = flip an `active` flag on a DB row. Instant; applies to the next task.
- On task dispatch, the server resolves the active `account_id` for the `(device, provider)` and
  tells the connector which account to run under.
- The connector is a dumb executor: given an `account_id`, it points the provider at that account's
  folder. This avoids DB/connector drift (a class of bug this codebase has been bitten by before).

### Decisions

1. **User names each account.** A `subscriptionType` hint (e.g. "pro") may be shown next to the
   label, but the label is user-supplied at add time.
2. **A newly-added account becomes active by default** — the reason to add a second account is to
   use it immediately (the usage-limit scenario). The user can switch back anytime.
3. **Expired token = existing failure path.** Switching to an account whose login has since expired
   fails the task with the normal auth-error banner; the user re-authenticates that one slot. No
   live token-refresh-on-switch in the MVP.

## Database Schema & RPCs

### `provider_connections` (extend)
`supabase/migrations/202607280001_ai_tasks.sql:60-76`

- Add `account_id uuid not null`, `label text not null`, `active boolean not null default false`.
- Replace `unique (device_id, provider)` with `unique (device_id, provider, account_id)`.
- Add partial unique index enforcing one active per provider:
  `unique (device_id, provider) where active`.

### `provider_setup_requests` (extend)
`supabase/migrations/202607290001_provider_setup.sql:49-89`

- Add `account_id uuid` and `label text`, carried through setup so the connector knows which slot
  to log into.
- Keep the existing "one live setup per `(device, provider)`" idempotency index — accounts are
  added/re-authenticated one at a time.

### RPCs

- `create_provider_setup_request(device, provider, label)` — generates a new `account_id` for an
  *add*; accepts an existing `account_id` for a *re-auth* of a known slot.
- `settle_provider_setup_request` — writes the connection row keyed by `account_id` + `label`, and
  marks the new account `active` (decision #2). Update `upsert_provider_connections` conflict target
  (`202607280001_ai_tasks.sql:1370`) to `(device_id, provider, account_id)`.
- **New** `set_active_provider_account(device, provider, account_id)` — the switch; flips `active`.
  Called by both the UI switch and the usage-limit banner.
- **New** `remove_provider_account(device, provider, account_id)` — "log out this account": deletes
  the connection row and signals the connector to clear that slot's folder.
- `list_execution_devices()` (`202607280002_device_pairing.sql:201-246`) — return **accounts per
  provider** (array of `{ label, active, subscriptionType?, ...status }`) instead of a single
  flattened provider status.

## Connector Wiring

Thread an `account_id` through the resolution chain:

- `providerHome(provider, accountId)` → `providers/<provider>/accounts/<id>/home`
  (`apps/connector/src/config/paths.ts:87`). Installed binary stays shared
  (`providerCurrent`/`providerVersion` remain provider-level).
- `managedProviderEnvironment(paths, provider, accountId)`
  (`apps/connector/src/providers/provider-installer.ts:238`) and
  `taskChildEnvironment(paths, provider, workspaceDir, accountId)`
  (`apps/connector/src/security/child-environment.ts:31`) gain an `accountId` param.
- **Detector** (`provider-detector.ts:185`) probes the specific account's folder; widen
  `ClaudeStatusSchema` (line 29) if we surface `subscriptionType`.
- **Login** (`provider-setup.ts:342-382`) points at the new slot's (empty) folder — the guard sees
  signed-out and actually opens the login window (the currently-broken behavior).
- **Task run** — `claude-adapter.ts:100` / `codex-adapter.ts:89` receive the dispatched `account_id`
  and run under that slot.
- **New connector command** to clear a slot's folder (`remove_provider_account` path).

Task/setup dispatch payloads (gateway → connector) carry the resolved `account_id`.

## Web UI

- **Accounts list** in `apps/web/src/features/ai/components/device-list.tsx`: each account shown with
  its label, an "Active" marker, `subscriptionType` hint, a **Set active** toggle, and a per-account
  **Log out**.
- **"Add another account"** (in `connect-device.tsx`) → prompt for a label → run setup into a fresh
  slot → open the real login window.
- **Usage-limit banner** (`apps/web/src/features/ai/components/agent-task-state.tsx`): when a task
  fails `usage_limit_reached` **and** the `(device, provider)` has 2+ accounts, the banner becomes
  "Usage limit reached — switch to **[other account]**?" with a one-click switch (calls
  `set_active_provider_account`) and a retry prompt. With only one account, the banner is unchanged.

## Error Handling

- Switch to expired account → normal auth-failure path (decision #3).
- Add-account login timeout/cancel → existing setup-failure handling; the new slot folder is cleaned
  up so a retry starts fresh.
- Remove active account → promote the most-recently-added remaining account to active; if no
  accounts remain, active is cleared and the provider returns to the "not connected" state.

## Testing

- **Connector unit tests:** per-account HOME resolution; login-into-empty-slot opens a login window
  even when another account is authenticated; task run uses the dispatched account's folder.
- **DB tests:** the new unique constraints (multiple accounts per provider; exactly one active);
  `set_active_provider_account`; `remove_provider_account`; `settle_*` marking the new account active.
- **Playwright e2e:** connect two fake accounts, switch active, assert the next task runs under the
  switched account; plus the usage-limit-banner-switch flow. (This repo's hard-won lesson: only e2e
  catches `"use server"` runtime errors, so e2e coverage is required here.)

## Out of Scope (YAGNI)

- Automatic failover on usage limit (this design is the foundation for it, not it).
- Auto-detecting account email/identity.
- Live token refresh on switch.
- Anything beyond manual, user-driven switching.
