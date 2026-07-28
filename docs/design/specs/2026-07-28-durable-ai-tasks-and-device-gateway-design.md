# Durable AI Tasks and Device Gateway Design

**Date:** 2026-07-28
**Status:** Approved
**Implements:** Task 6 of `docs/design/plans/2026-07-24-personal-ai-product-lifecycle-mvp.md`
**Governed by:** `docs/design/specs/2026-07-25-provider-connection-model-design.md`

## 1. Decision

Meld gains a durable AI task record and a standalone device gateway. A task is
created by the web application under the initiating user's session, persisted
with a frozen room-scoped context manifest, and executed later by that user's own
paired Mac. The gateway terminates device WebSocket connections, but holds no
authoritative state: PostgreSQL owns every status transition.

Three properties define the feature:

1. A task survives gateway restart, device restart, and network loss.
2. A task runs only on the initiating user's own device, and only if that user
   still has access to the room at the moment of execution.
3. The device receives room content, never database access, storage URLs, or
   credentials.

## 2. Architecture

Three participants, each independently testable.

### Web application

Creates and cancels tasks under the user's Supabase session with RLS in force.
Builds the context manifest by reading only records the user can already see.
Holds no service-role credential.

### PostgreSQL

Owns the task state machine, claim atomicity, event ordering, and the
authorization re-check performed at execution time. Exposed as `security definer`
functions so that both callers share one implementation.

### Gateway (`apps/gateway`)

A Fastify + WebSocket process. Authenticates devices, validates every frame with
Zod, enforces event sequencing, and calls database functions. It is the only
component holding the service-role key.

### 2.1 Why PostgreSQL owns the state machine

`SELECT ... FOR UPDATE SKIP LOCKED` — required for safe claiming — cannot be
expressed through `supabase-js`, and neither can a multi-statement transaction.
The alternative is a second database dependency and connection pool in the
gateway, plus a transition map duplicated between gateway and web. Placing the
atomic operations in PL/pgSQL gives the gateway exactly one database access path,
no new dependencies, and puts every transition under the pgTAP harness already
running in CI's `database` job.

### 2.2 Why the gateway polls

A connected device learns of new work through a periodic sweep, not a push.
Polling is durable by construction: a task queued while the device was offline is
picked up by the identical code path as one queued while it was connected, so
there is no lost-notification case to reason about. Latency equals the poll
interval, which is immaterial against provider runs measured in tens of seconds.
`LISTEN/NOTIFY` remains available later as a pure latency optimisation, because
it would change no semantics.

## 3. Data Model

Migration `supabase/migrations/202607280001_ai_tasks.sql`. The filename uses
today's date; the `202607240005` name suggested by the MVP plan would sort before
six existing migrations.

### 3.1 `execution_devices`

`id`, `user_id` → `auth.users`, `name`, `platform`, `token_hash` (unique),
`status` (`active` | `revoked`), `connector_version`, `last_seen_at`,
`revoked_at`, `created_at`.

`token_hash` stores the hex SHA-256 of the device secret. Plaintext device tokens
never enter the database.

### 3.2 `provider_connections`

`id`, `user_id`, `device_id` → `execution_devices`, `provider`, `installation`,
`version`, `authentication`, `compatibility`, `last_seen_at`, with
`unique (device_id, provider)`.

The table has no column for an executable path, credential path, environment
value, or provider response body. The security boundary of the `provider.status`
frame is therefore enforced by schema rather than by reviewer discipline: there
is nowhere for that data to be written.

### 3.3 `ai_tasks`

`id`, `initiating_user_id`, `organization_id`, `room_id`, `device_id`,
`provider`, `kind`, `status`, `instruction`, `context_manifest_json`,
`context_revision`, `result_json`, `error_code`, `error_message`, `cancelled_at`,
`created_at`, `updated_at`.

`context_manifest_json` stores authorized message IDs, attachment IDs, evidence
IDs, and decision IDs — never signed URLs, storage paths, or copied room bodies.

### 3.4 `ai_task_events`

`task_id`, `sequence`, `type`, `payload_json`, `created_at`, with
**primary key `(task_id, sequence)`**.

The composite primary key supplies both sequence uniqueness and reconnect
idempotency without additional logic: a device replaying event 7 after
reconnecting raises a unique violation, which `append_ai_task_event` translates
into a repeat acknowledgement rather than an error.

### 3.5 Enum parity

PostgreSQL enums mirror the Zod enums in `packages/contracts` — `provider`,
`ai_task_kind`, `ai_task_status`, the three provider-status enums from `ai.ts`,
and `task_error_code` from `ws.ts`, which types the `ai_tasks.error_code` column.
Divergence between the two would be invisible until runtime, so
`scripts/check-contract-enum-parity.mjs` parses the migration and asserts set
equality against the contracts package, following the existing
`scripts/check-*.mjs` convention and running in CI.

## 4. State Machine

`transition_ai_task(p_task_id, p_to, p_from)` is a compare-and-swap. It applies
the transition only when the row's current status equals `p_from` *and* the
`(p_from, p_to)` pair appears in the allowed map; otherwise it raises `P0001`
with message `invalid_ai_task_transition`.

| From | Allowed `to` |
| --- | --- |
| `queued` | `waiting_for_device`, `ready_to_run` |
| `waiting_for_device` | `ready_to_run` |
| `ready_to_run` | `running`, `waiting_for_device` |
| `running` | `completed`, `needs_review`, `needs_reauthentication`, `usage_limit_reached`, `waiting_for_device` |
| `needs_reauthentication` | `ready_to_run` |
| `usage_limit_reached` | `ready_to_run` |
| `needs_review` | `completed` |
| `completed`, `cancelled`, `failed` | — terminal |

Every non-terminal status may additionally transition to `cancelled` or `failed`.

Cancellation-cannot-complete requires no special handling. A device finishing
work after the user cancelled calls `transition_ai_task(id, 'completed',
'running')`, which fails because the stored status already reads `cancelled`.
The same compare-and-swap makes concurrent claims safe.

`running → waiting_for_device` is the reaper edge (§6.4);
`ready_to_run → waiting_for_device` covers a device disconnecting after
notification but before claiming.

## 5. Database Functions

| Function | Caller | Behaviour |
| --- | --- | --- |
| `transition_ai_task(task, to, from)` | internal | Compare-and-swap described in §4. |
| `cancel_ai_task(task)` | `authenticated` | Asserts `auth.uid() = initiating_user_id`, transitions to `cancelled`, sets `cancelled_at`. |
| `claim_ai_task(task, device)` | `service_role` | `FOR UPDATE SKIP LOCKED`; asserts `ai_tasks.device_id = device` **and** `ai_tasks.initiating_user_id = execution_devices.user_id`; transitions `ready_to_run → running`. |
| `hydrate_authorized_room_context(task)` | `service_role` | Re-derives the initiating user's current access and returns manifest-listed records only. |
| `append_ai_task_event(task, device, sequence, type, payload)` | `service_role` | Inserts; on unique violation compares the stored payload — identical replays return the existing sequence for idempotent re-acknowledgement, a differing payload raises `conflicting_ai_task_event`. |
| `complete_ai_task(task, device, result, partial)` | `service_role` | `partial = false` → `completed`; `partial = true` → `needs_review`. |
| `fail_ai_task(task, device, code, message)` | `service_role` | Transitions to `failed`, records typed code and message. |
| `reap_stale_ai_tasks(timeout)` | `service_role` | §6.4. |

Task creation is a plain insert under RLS — a policy requiring room
participation and `initiating_user_id = auth.uid()` expresses it exactly, so no
function is needed.

Execute permission is granted to `authenticated` only for `cancel_ai_task`, and
to `service_role` only for the gateway functions. `transition_ai_task` is granted
to neither and is reachable only from the other functions.

### 5.1 `hydrate_authorized_room_context` is the security-critical function

The gateway runs as service-role, so RLS does not protect this path. The function
must therefore re-derive access from first principles rather than trusting the
manifest: it returns only those manifest-listed messages, attachments, evidence,
and decisions that `initiating_user_id` can reach **at call time**, and includes
only validated extracted attachment text plus user captions.

If the user's access changed since creation, the task transitions to `failed`
with `permission_changed` and no context is emitted. This satisfies the
governing design's §8 requirement to revalidate immediately before execution so
queued work cannot outlive a revocation. Performing it in SQL yields one atomic
read of access-plus-content and makes it directly pgTAP-testable.

## 6. Gateway

```
apps/gateway/src/
  server.ts                  Fastify, /health, WebSocket upgrade route
  auth/device-token.ts       mint / hash / constant-time verify  (shared)
  auth/device-auth.ts        upgrade-time authentication
  tasks/task-repository.ts   service-role client, one wrapper per function in §5
  ws/device-session.ts       per-connection state, heartbeat, claimed tasks
  ws/protocol-handler.ts     frame routing, Zod validation, sequencing
  dispatch/sweeper.ts        poll, notify, reap
```

New dependencies, pinned exactly per repository convention:
`@fastify/websocket`, `@supabase/supabase-js`, `@meld/contracts`, `zod`.

Configuration: `GATEWAY_PORT`, `GATEWAY_SUPABASE_URL`,
`GATEWAY_SUPABASE_SERVICE_ROLE_KEY`, `GATEWAY_POLL_INTERVAL_MS` (default 3000),
`GATEWAY_TASK_STALE_TIMEOUT_MS` (default 300000). Added to `.env.example`.

### 6.1 Device authentication

The WebSocket upgrade requires `Authorization: Device <deviceId>.<secret>`. The
gateway hashes the presented secret, fetches the device by ID, and compares with
`timingSafeEqual`. When no device row exists it compares against a fixed dummy
digest so that response timing does not disclose device existence. A missing,
malformed, mismatched, or revoked credential returns `401` and no socket is
established. Success updates `last_seen_at`, records `connector_version`, and
emits `session.accepted { heartbeatSeconds: 30 }`.

`auth/device-token.ts` owns secret generation (32 random bytes, base64url) and
hashing. `scripts/seed-device.mjs` (§8) and Task 7's pairing flow both call it,
so there is one implementation of the credential format.

### 6.2 Dispatch

Each sweep, for every task in `queued`:

- device currently connected → `ready_to_run`, send `task.available`;
- device not connected → `waiting_for_device`.

When a device connects, its `waiting_for_device` tasks move to `ready_to_run` and
are announced. This makes "your Mac is offline" a real, queryable state rather
than an inference from absence, while honouring the governing design's rule that
an offline device's work stays queued and is never transferred to another member.

"Currently connected" is read from the sweeper's in-process set of live sockets,
which assumes a **single gateway instance**. Two instances would each hold a
partial view and would mark each other's connected devices offline. This is
acceptable now — the gateway is not yet deployed (§10) — and the constraint is
recorded here because horizontal scaling requires replacing the in-process set
with a shared liveness signal, not because it is a defect to fix in this task.
No correctness property depends on it: claiming remains safe under
`FOR UPDATE SKIP LOCKED` regardless of instance count, so the failure mode is a
delayed task, never a duplicated or misrouted one.

### 6.3 Protocol

`task.claim` → `claim_ai_task` → `hydrate_authorized_room_context` → exactly one
`task.payload`. A claim that loses the race, or that fails revalidation, yields a
typed failure and no context.

`task.event` → `append_ai_task_event` → `task.event_ack` with the persisted
sequence. `task.complete`, `task.fail`, and `task.cancelled` are terminal. A user
cancellation is delivered to the device as `task.cancel` on the next sweep.

`provider.status` upserts `provider_connections` on `(device_id, provider)`.

### 6.4 Reaper

`reap_stale_ai_tasks` returns `running` tasks whose device has not been seen
within `GATEWAY_TASK_STALE_TIMEOUT_MS` to `waiting_for_device`, making them
eligible for re-announcement when the device returns. Without it, a task whose
device disappeared mid-run would remain `running` forever. This is an addition to
the MVP plan, which does not address the case.

## 7. Error Handling

| Condition | Response |
| --- | --- |
| Bad, revoked, or malformed credential | `401` at upgrade; no socket |
| Frame fails Zod validation | Close `1008`; a correct connector never emits one, and tolerating malformed input only widens the attack surface |
| Duplicate sequence after reconnect | Idempotent re-acknowledgement (§3.4) |
| Sequence lower than persisted, differing payload | Reject; close `1008` |
| Claim lost to another connection | Typed failure, no context emitted |
| Access revoked between create and claim | `failed` / `permission_changed`, no context emitted |
| Device disappears mid-run | Reaper returns task to `waiting_for_device` (§6.4) |
| Missed heartbeats (2 × 30s + grace) | Close socket; tasks unaffected |
| Provider signed out / allowance reached | `needs_reauthentication` / `usage_limit_reached`, resumable to `ready_to_run` |
| Partial or malformed provider output | `needs_review`, preserving partial text separately from authoritative output |

## 8. Device Provisioning

Task 6 introduces no device-registration HTTP endpoint. Task 7 builds the real
one-command pairing flow with its own security model (single-use tokens expiring
in ten minutes, per the governing design §3.1); a placeholder endpoint shipped
now would be replaced within one task, and half-designed authentication surfaces
tend to outlive their intended lifetime.

Instead, `scripts/seed-device.mjs` inserts an `execution_devices` row and prints
`deviceId.secret` once, giving full end-to-end drivability locally with no
production surface.

## 9. Testing

**pgTAP** (`supabase/tests/ai_task_transitions.test.sql`) carries the
correctness weight, because it is the only layer where real locking exists:
legal and illegal transitions including the two cases named in the MVP plan;
claim rejected when task and device owners differ; concurrent claim yielding
exactly one winner; cancel-then-complete rejected; a replayed event
acknowledged idempotently and a conflicting one at the same sequence rejected;
hydration returning nothing once room access is revoked.

**Gateway vitest**, colocated per `scripts/check-test-colocation.mjs`:
`device-token` mint/verify round-trip, `device-auth` rejection paths and
unknown-device timing, `protocol-handler` per-frame validation, sequencing, and
close conditions.

**Web vitest**: `task-service` manifest construction, asserting the manifest
carries identifiers only and no storage paths or bodies.

**Manual verification.** Task 6 adds no UI, so it has no Playwright coverage —
and this repository has already been bitten by defects that typecheck, unit
tests, and build all pass. `scripts/fake-connector.mjs` closes that gap: a
scriptable device that authenticates with a seeded credential, connects, claims,
streams events, and completes a task against a locally running gateway. It is
both the verification vehicle for this task and the reference implementation
Task 7's macOS connector is written against.

## 10. Out of Scope

Deliberately excluded, with the task that owns each:

- **Default provider per user** (`ai_connections`) — Settings → AI connections;
  §6 of the governing design. Task 6 takes `provider` as an explicit input.
- **PRD version in the manifest** — Task 11, which introduces PRD tables. No
  nullable placeholder column is added now: a field that is always null cannot be
  tested and is indistinguishable from a defect until it acquires meaning.
- **Pairing and the macOS connector** — Task 7.
- **Codex and Claude adapters, provider execution** — Task 8.
- **Room UI for task status and streamed events** — Task 10.
- **Gateway deployment and hosting** — the gateway runs locally and in tests.
