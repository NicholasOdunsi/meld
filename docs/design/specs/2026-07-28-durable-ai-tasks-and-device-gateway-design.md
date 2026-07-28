# Durable AI Tasks and Device Gateway Design

**Date:** 2026-07-28
**Status:** Draft — revised after review, pending re-approval
**Implements:** Task 6 of `docs/design/plans/2026-07-24-personal-ai-product-lifecycle-mvp.md`
**Governed by:** `docs/design/specs/2026-07-25-provider-connection-model-design.md`

## 1. Decision

Meld gains a durable AI task record and a standalone device gateway. A task is
created by the web application under the initiating user's session, persisted
with a frozen room-scoped context manifest, and executed later by that user's own
paired Mac. The gateway terminates device WebSocket connections, but holds no
authoritative state: PostgreSQL owns every status transition.

Three properties define the feature:

1. A task survives gateway restart, device restart, and network loss, and is
   never executed or reported on twice.
2. A task runs only on the initiating user's own device, and only if that user
   still has access to the room at the moment of execution.
3. The device receives bounded room content, never database access, storage
   URLs, or credentials.

## 2. Architecture

Three participants, each independently testable.

### Web application

Creates and cancels tasks under the user's Supabase session. Builds the context
manifest by reading only records the user can already see. Holds no service-role
credential.

### PostgreSQL

Owns the task state machine, claim atomicity, execution leases, event ordering,
and the authorization re-check performed at execution time. Exposed as
`security definer` functions so both callers share one implementation.

### Gateway (`apps/gateway`)

A Fastify + WebSocket process. Authenticates devices, validates every frame with
Zod, and calls database functions. It is the only component holding the
service-role key. It enforces no invariant that the database does not also
enforce — it is a transport, not an authority.

### 2.1 Why PostgreSQL owns the state machine

`SELECT ... FOR UPDATE SKIP LOCKED` — required for safe claiming — cannot be
expressed through `supabase-js`, and neither can a multi-statement transaction.
The alternative is a second database dependency and connection pool in the
gateway, plus a transition map duplicated between gateway and web. Placing the
atomic operations in PL/pgSQL gives the gateway exactly one database access path
and no new dependencies.

### 2.2 Why the gateway polls

A connected device learns of new work through a periodic sweep, not a push.
Polling is durable by construction: a task queued while the device was offline
follows the identical path as one queued while it was connected, so there is no
lost-notification case to reason about. Latency equals the poll interval, which
is immaterial against provider runs measured in tens of seconds. `LISTEN/NOTIFY`
remains available later as a pure latency optimisation.

## 3. Attempts and Leases

An execution **attempt** is the unit of durability. Claiming mints a new
`attempt_id` and an expiring lease; every subsequent device operation on that
task must present the matching `attempt_id` against an unexpired lease.

This replaces device liveness as the recovery signal. Keying recovery on
`execution_devices.last_seen_at` is unsound in both directions: a connector that
restarts and resumes heartbeats keeps its device row fresh while its abandoned
task stays `running` forever, and a task requeued after a network partition can
be completed by the original process, because a frame carrying only `taskId`
is indistinguishable from a frame sent by the current attempt.

- `claim_ai_task` sets `attempt_id = gen_random_uuid()` and
  `lease_expires_at = now() + GATEWAY_TASK_LEASE`.
- `task.payload` carries `attemptId`. Every device→server task frame
  (`task.event`, `task.complete`, `task.fail`, `task.cancelled`) carries it.
- Every event and terminal operation validates, inside the same row lock, that
  the presented `attempt_id` equals the stored one and that
  `lease_expires_at > now()`. A mismatch raises `stale_ai_task_attempt`.
- The device renews by including `activeTasks: [{ taskId, attemptId }]` on its
  existing 30-second `heartbeat` frame, which extends the lease for each listed
  task it still owns. Reusing the heartbeat avoids a second liveness mechanism
  with its own timing to reason about.
- Lease duration is 90 seconds — three missed heartbeats.

Recovery therefore depends only on the lease, and a stale process is rejected by
the same check that performs recovery, rather than by a separate one that has to
agree with it.

## 4. Data Model

Migration `supabase/migrations/202607280001_ai_tasks.sql`. The filename uses
today's date; the `202607240005` name suggested by the MVP plan would sort before
six existing migrations.

### 4.1 `execution_devices`

`id`, `user_id` → `auth.users`, `name`, `platform`, `token_hash` (unique),
`status` (`active` | `revoked`), `connector_version`, `last_seen_at`,
`revoked_at`, `created_at`, plus **`unique (id, user_id)`**.

`token_hash` stores the hex SHA-256 of the device secret. Plaintext device tokens
never enter the database. `last_seen_at` is observability only; no authorization
or recovery decision reads it.

### 4.2 `provider_connections`

`id`, `user_id`, `device_id`, `provider`, `installation`, `version`,
`authentication`, `compatibility`, `last_seen_at`, with
`unique (device_id, provider)` and
**`foreign key (device_id, user_id) references execution_devices (id, user_id)`**.

The composite foreign key makes the denormalised `user_id` incapable of drifting
from the device's owner. This is the idiom already used in this schema —
`mentions` references `messages (id, room_id)` the same way.

The table has no column for an executable path, credential path, environment
value, or provider response body, so the `provider.status` security boundary is
enforced by schema rather than by reviewer discipline.

### 4.3 `ai_tasks`

`id`, `initiating_user_id`, `organization_id`, `room_id`, `device_id`,
`provider`, `kind`, `status`, `instruction`, `context_manifest_json`,
`context_revision`, `attempt_id`, `lease_expires_at`, `result_json`,
`error_code`, `error_message`, `cancelled_at`, `created_at`, `updated_at`.

Two composite foreign keys carry the authorization invariants that would
otherwise depend on a policy being written correctly:

- **`(device_id, initiating_user_id)` → `execution_devices (id, user_id)`** — a
  task physically cannot reference another user's device.
- **`(room_id, organization_id)` → `discovery_rooms (id, organization_id)`** — a
  task's organisation cannot disagree with its room's. This requires adding
  `unique (id, organization_id)` to `discovery_rooms`.

`context_manifest_json` stores authorized message, attachment, evidence, and
decision IDs — never signed URLs, storage paths, or copied room bodies.
`result_json` carries a size `check` constraint (§7.3).

### 4.4 `ai_task_events`

`task_id` → `ai_tasks`, `attempt_id`, `sequence`, `type`, `payload_json`,
`created_at`, with primary key **`(task_id, attempt_id, sequence)`**.

`attempt_id` is part of the key because sequence numbering restarts at 1 for each
attempt; without it, a retried task's first event would collide with the previous
attempt's. It is a plain column rather than a foreign key: `ai_tasks.attempt_id`
holds only the *current* attempt and is cleared when the task leaves `running`,
so a reference would break exactly when the history becomes worth keeping.
Retaining superseded attempts' events preserves the execution audit trail.
`payload_json` carries a size `check` constraint (§7.3).

The primary key provides uniqueness only. **Ordering is enforced procedurally**
in `append_ai_task_event`, not by the key — a unique constraint permits sequence
7 to arrive before sequence 1.

### 4.5 Enum parity

PostgreSQL enums mirror the Zod enums in `packages/contracts` — `provider`,
`ai_task_kind`, `ai_task_status`, the three provider-status enums from `ai.ts`,
and `task_error_code` from `ws.ts`, which types `ai_tasks.error_code`.
Divergence would be invisible until runtime, so
`scripts/check-contract-enum-parity.mjs` parses the migration with
`pgsql-parser` and asserts set equality against the contracts package, following
the existing `check-sql-arities.mjs` and `check-discovery-sql.mjs` pattern, and
runs in CI.

## 5. State Machine

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
| `needs_review` | `completed`, `ready_to_run` |
| `completed`, `cancelled`, `failed` | — terminal |

Every non-terminal status may additionally transition to `cancelled` or `failed`.

Any transition out of `running` clears `attempt_id` and `lease_expires_at`, which
is what invalidates a superseded attempt.

Cancellation-cannot-complete needs no special handling: a device finishing work
after cancellation calls `transition_ai_task(id, 'completed', 'running')`, which
fails because the stored status reads `cancelled`. The attempt check in §3 closes
the same hole for the requeue case.

`running → waiting_for_device` is the lease-expiry edge (§6.4);
`ready_to_run → waiting_for_device` covers a device disconnecting after
notification but before claiming.

## 6. Database Functions

| Function | Caller | Behaviour |
| --- | --- | --- |
| `transition_ai_task(task, to, from)` | internal | Compare-and-swap described in §5. |
| `create_ai_task(room, device, provider, kind, instruction, manifest)` | `authenticated` | §6.1. |
| `cancel_ai_task(task)` | `authenticated` | Asserts `auth.uid() = initiating_user_id`, transitions to `cancelled`, sets `cancelled_at`. |
| `resolve_ai_task(task, action)` | `authenticated` | §6.5. Drives the paused states back to `ready_to_run`, `completed`, or `cancelled`. |
| `claim_ai_task(task, device)` | `service_role` | §6.2. |
| `hydrate_authorized_room_context(task, attempt)` | `service_role` | §6.3. |
| `append_ai_task_event(task, device, attempt, sequence, type, payload)` | `service_role` | §6.4. |
| `complete_ai_task(task, device, attempt, result, partial)` | `service_role` | Validates attempt and lease; `partial = false` → `completed`, `partial = true` → `needs_review`. |
| `fail_ai_task(task, device, attempt, code, message)` | `service_role` | Validates attempt and lease; target status derived from `code` per §7.4. |
| `reap_expired_ai_task_leases()` | `service_role` | §6.6. |

Execute permission is granted to `authenticated` only for `create_ai_task`,
`cancel_ai_task`, and `resolve_ai_task`, and to `service_role` only for the
gateway functions. `transition_ai_task` is granted to neither and is reachable
only from the other functions. `insert`, `update`, and `delete` on `ai_tasks` and
`ai_task_events` are revoked from `authenticated` entirely; `select` remains under
RLS so the room UI can read task state in Task 10.

### 6.1 Creation is an RPC, not a client insert

A plain insert cannot express the required invariants, because the client
supplies `organization_id` and `device_id`. `create_ai_task` is
`security definer` and derives rather than trusts:

1. `initiating_user_id := auth.uid()`.
2. `organization_id` is read from the room, never accepted as an argument.
3. Asserts the caller participates in the room.
4. Asserts the device is `active`, not revoked, and owned by `auth.uid()`.
5. Asserts a `provider_connections` row exists for `(device_id, provider)`.
6. Validates the manifest references only records the caller can currently read.

The composite foreign keys in §4.3 make steps 2 and 4 unfalsifiable even if this
function were later modified incorrectly. Defence in depth is warranted here
because the failure mode is one user's content executing on another user's
machine.

### 6.2 Claiming

`FOR UPDATE SKIP LOCKED` on the task row; asserts `ai_tasks.device_id = device`;
transitions `ready_to_run → running`; mints `attempt_id` and `lease_expires_at`;
returns both. Owner equality is guaranteed by the composite foreign key rather
than re-checked.

### 6.3 `hydrate_authorized_room_context` is the security-critical function

The gateway runs as service-role, so RLS does not protect this path. The function
re-derives access from first principles rather than trusting the manifest: it
returns only those manifest-listed messages, attachments, evidence, and decisions
that `initiating_user_id` can reach **at call time**, and includes only validated
extracted attachment text plus user captions. It validates the attempt, so a
stale claim cannot pull context.

If access changed since creation, the task transitions to `failed` with
`permission_changed` and no context is emitted — satisfying the governing
design's §8 requirement that queued work cannot outlive a revocation. Performing
it in SQL yields one atomic read of access-plus-content and is directly
pgTAP-testable.

### 6.4 Event append enforces ordering

Within one transaction, `append_ai_task_event`:

1. Takes `FOR UPDATE` on the task row.
2. Requires `status = 'running'`, so cancelled, failed, and completed tasks
   cannot continue receiving events.
3. Requires the presented `attempt_id` to match and the lease to be unexpired.
4. Requires `sequence = coalesce(max(sequence), 0) + 1` for that
   `(task_id, attempt_id)`. The first event of an attempt is sequence 1.
5. On an exact replay — same sequence, same `type`, same `payload_json` —
   returns the stored sequence for idempotent re-acknowledgement.
6. On the same sequence with a differing type or payload, raises
   `conflicting_ai_task_event`.
7. Renews the lease, since event traffic is itself proof of liveness.

### 6.5 `resolve_ai_task`

Authenticated, asserts `auth.uid() = initiating_user_id`, and takes an action:

| Action | Valid from | To |
| --- | --- | --- |
| `retry` | `needs_reauthentication`, `usage_limit_reached`, `needs_review` | `ready_to_run` |
| `accept` | `needs_review` | `completed` |
| `discard` | `needs_review` | `cancelled` |

These are the "Keep partial draft / Retry / Discard" and re-authentication
recoveries the governing design §8 requires. The web API surface for them is
Task 10's; this task provides the RPC and the state machine edges so those
statuses are not dead ends.

### 6.6 Lease reaping

`reap_expired_ai_task_leases` returns `running` tasks whose `lease_expires_at`
has passed to `waiting_for_device` and clears the attempt, making them eligible
for re-announcement. It reads no device state.

## 7. Protocol and Contract Changes

The current contracts cannot validate what this design promises, so
`packages/contracts` changes alongside the migration:

- `ai.ts` — `AIContextPackageSchema` gains `evidence` and `decisions` (§7.1).
- `ws.ts` — `task.payload` gains `attemptId`; `task.event`, `task.complete`,
  `task.fail`, and `task.cancelled` each gain `attemptId`; `heartbeat` gains
  `activeTasks: { taskId, attemptId }[]` for lease renewal (§3).
- `ws.ts` — `task.event.event` becomes the bounded `TaskEventSchema` union
  (§7.2), and payload size caps are applied (§7.3).

### 7.1 Context package gains evidence and decisions

`AIContextPackageSchema` (`ai.ts:58`) has no `evidence` or `decisions` fields, so
a manifest that records their IDs could not deliver them. Adding, with the same
bounded shape as `messages` and `attachments`:

- `evidence: { id, title, note }[]`
- `decisions: { id, summary, sourceMessageId }[]`

### 7.2 Events become a bounded union

`task.event` currently accepts `z.record(z.string(), z.unknown())`
(`ws.ts:64`), so "validates every frame with Zod" is not true of event content.
`TaskEventSchema` becomes a discriminated union with explicit length caps:

- `{ type: "progress", label: string.max(200), percent?: 0–100 }`
- `{ type: "text.delta", text: string.max(10_000) }`
- `{ type: "notice", code: TaskErrorCode, message: string.max(2_000) }`

Unknown event types are rejected at the boundary, matching the governing design
§7 requirement that the connector reject unknown tool, file, or subprocess
events — the gateway applies the same rule in the other direction.

### 7.3 Size limits are enforced at three layers

`@fastify/websocket` is configured with `maxPayload` of 1 MiB; `ai_task_events`
and `ai_tasks` carry `check (octet_length(payload_json::text) <= …)` and the
equivalent for `result_json`. A frame the gateway accepts but the database
rejects would surface as an unexplained failure mid-stream, so the caps are set
consistently and asserted in tests.

`AIResultEnvelope.payload` remains `z.unknown()` under a size cap. Per-kind
result schemas are deliberately deferred: `prd_generate` validates against
`PRDDocumentSchema` only once PRD tables exist (Task 11), and `room_reply` once
the room renders results (Task 10). Defining them now would mean writing
validation no code path can exercise. The size cap and the bounded event union
are what constrain the boundary in this task, and §11 records the deferral.

### 7.4 Error codes map to statuses

`fail_ai_task` deriving a single terminal `failed` would contradict the resumable
states the governing design §8 requires. The mapping:

| `task_error_code` | Status |
| --- | --- |
| `authentication_required` | `needs_reauthentication` |
| `usage_limit_reached` | `usage_limit_reached` |
| `malformed_output` | `needs_review` — partial text preserved separately |
| `cancelled` | `cancelled` |
| `permission_changed`, `security_boundary_violated`, `provider_unavailable`, `provider_install_failed`, `unknown` | `failed` |
| `connector_outdated` | `failed` — see below |

`connector_outdated` is an accepted gap. The governing design §8 says an
unsupported provider version should *pause* and offer a managed update, but the
`ai_task_status` enum has no state for it. Inventing one now would add a status
no code path in this task can enter or leave. Task 8 owns provider version
management and adds the state with the update flow that makes it resumable; until
then the code is recorded on a `failed` task and the user re-runs.

## 8. Gateway

```
apps/gateway/src/
  main.ts                    entrypoint: listen, signal handling, shutdown
  server.ts                  Fastify, /health, WebSocket upgrade route
  auth/device-token.ts       mint / hash / constant-time verify  (shared)
  auth/device-auth.ts        upgrade-time authentication
  tasks/task-repository.ts   service-role client, one wrapper per §6 function
  ws/device-session.ts       per-connection state, heartbeat, lease renewal
  ws/protocol-handler.ts     frame routing, Zod validation, sequencing
  dispatch/sweeper.ts        poll, notify, reap
```

### 8.1 Making the package runnable

The package currently declares only `lint`, `test`, and `typecheck`
(`package.json:6-10`), sets `noEmit: true` (`tsconfig.json:7`), and nothing calls
`listen()` — it cannot be started. Changes:

- `tsconfig.json`: drop `noEmit`, add `outDir: "dist"` and `rootDir: "src"`. The
  `typecheck` script keeps `tsc --noEmit`, where the CLI flag overrides.
- Scripts: `build: "tsc"`, `start: "node dist/main.js"`, `dev: "tsx watch src/main.ts"`.
- `main.ts` binds `GATEWAY_PORT`, and on `SIGINT`/`SIGTERM` stops the sweeper,
  closes sockets with code `1001`, and awaits in-flight database calls.
- Dependencies pinned exactly per repository convention: `@fastify/websocket`,
  `@supabase/supabase-js`, `@meld/contracts`, `zod`; `tsx` as a devDependency.

`scripts/seed-device.ts` and `scripts/fake-connector.ts` are TypeScript run via
`pnpm exec tsx`, not `.mjs`. Plain Node cannot import `auth/device-token.ts`, and
duplicating the credential format in a `.mjs` file would defeat the single
implementation that Task 7's pairing flow is meant to reuse.

`scripts/check-test-colocation.mjs` currently runs against `apps/web` only; CI
extends it to `apps/gateway`.

Configuration: `GATEWAY_PORT`, `GATEWAY_SUPABASE_URL`,
`GATEWAY_SUPABASE_SERVICE_ROLE_KEY`, `GATEWAY_POLL_INTERVAL_MS` (default 3000),
`GATEWAY_TASK_LEASE_MS` (default 90000). Added to `.env.example`.

### 8.2 Device authentication

The upgrade requires `Authorization: Device <deviceId>.<secret>`. The gateway
hashes the presented secret, fetches the device by ID, and compares with
`timingSafeEqual`. When no device row exists it compares against a fixed dummy
digest, so response timing does not disclose device existence. A missing,
malformed, mismatched, or revoked credential returns `401` and no socket is
established. Success updates `last_seen_at`, records `connector_version`, and
emits `session.accepted { heartbeatSeconds: 30 }`.

`auth/device-token.ts` owns secret generation (32 random bytes, base64url) and
hashing; the seed script and Task 7's pairing flow both call it.

### 8.3 Dispatch

Each sweep: `queued` tasks whose device is connected move to `ready_to_run` and
are announced with `task.available`; those whose device is absent move to
`waiting_for_device`. On connect, that device's `waiting_for_device` tasks move to
`ready_to_run` and are announced. Expired leases are reaped (§6.6).

This makes "your Mac is offline" a queryable state rather than an inference from
absence, and honours the governing design's rule that an offline device's work
stays queued and is never transferred to another member.

"Currently connected" is read from the sweeper's in-process socket set, which
assumes a **single gateway instance**; two instances would each hold a partial
view. This is acceptable now — the gateway is not yet deployed (§11) — and no
correctness property depends on it, because claiming is safe under `SKIP LOCKED`
and every operation is attempt-validated regardless of instance count. The
failure mode is a delayed task, never a duplicated or misrouted one. Horizontal
scaling requires replacing the in-process set with a shared liveness signal.

### 8.4 Frame flow

`task.claim` → `claim_ai_task` → `hydrate_authorized_room_context` → exactly one
`task.payload` carrying `attemptId`. A claim that loses the race, or fails
revalidation, yields a typed failure and no context.

`task.event` → `append_ai_task_event` → `task.event_ack`. `task.complete`,
`task.fail`, and `task.cancelled` are terminal for the attempt. A user
cancellation reaches the device as `task.cancel` on the next sweep.

`provider.status` upserts `provider_connections` on `(device_id, provider)`.

## 9. Error Handling

| Condition | Response |
| --- | --- |
| Bad, revoked, or malformed credential | `401` at upgrade; no socket |
| Frame fails Zod validation, or exceeds `maxPayload` | Close `1008`; a correct connector never emits one, and tolerating malformed input widens the attack surface |
| Exact event replay after reconnect | Idempotent re-acknowledgement (§6.4) |
| Same sequence, differing type or payload | `conflicting_ai_task_event`; close `1008` |
| Out-of-order sequence | Rejected by §6.4 step 4; close `1008` |
| Frame from a superseded attempt | `stale_ai_task_attempt`; frame discarded, socket left open — losing a lease is a race a correct connector cannot always avoid, unlike a protocol violation |
| Event for a non-`running` task | Rejected by §6.4 step 2 |
| Claim lost to another connection | Typed failure, no context emitted |
| Access revoked between create and claim | `failed` / `permission_changed`, no context emitted |
| Lease expires mid-run | Task returns to `waiting_for_device`; the original attempt's later frames are rejected as stale |
| Missed heartbeats | Socket closed; tasks recovered by lease expiry, not by socket state |
| Provider sign-out, allowance, partial output | Mapped per §7.4; resumed via `resolve_ai_task` |

## 10. Testing

### 10.1 pgTAP — `supabase/tests/ai_task_transitions.test.sql`

Legal and illegal transitions including the two cases named in the MVP plan;
cancel-then-complete rejected; event ordering (gap rejected, out-of-order
rejected, exact replay acknowledged, conflicting payload rejected); events
rejected for non-`running` tasks; stale-attempt rejection; lease expiry
requeueing; error-code-to-status mapping (§7.4); `resolve_ai_task` transitions;
`create_ai_task` rejecting another user's device, a revoked device, a
non-participant room, and a provider with no connection; hydration returning
nothing once room access is revoked.

### 10.2 Integration — `apps/gateway/src/**/*.integration.test.ts`

pgTAP executes in a single session inside one transaction, so it **cannot**
exercise `SKIP LOCKED` contention or lease expiry across concurrent
transactions. These run in vitest against local Supabase and a live gateway,
using two independent service-role connections where contention is the subject:

- two devices race one task; exactly one claim succeeds, one context is emitted;
- gateway restarts after a claim; the task is recovered and completes;
- connector restarts mid-run; the resumed attempt is rejected as stale and the
  requeued task completes under a new attempt;
- a lease expires with the socket still open; the superseded attempt's
  `task.complete` is rejected and does not overwrite the new attempt's result;
- cancellation lands mid-execution; no event or completion is accepted after it;
- an event stream with a deliberate gap and a deliberate replay.

These are the feature's defining properties, so they are automated rather than
left to the manual script.

### 10.3 Unit

Gateway vitest, colocated: `device-token` round-trip, `device-auth` rejection
paths and unknown-device timing, `protocol-handler` per-frame validation and
close conditions. Web vitest: `task-service` manifest construction, asserting the
manifest carries identifiers only, with no storage paths or bodies.

### 10.4 Manual

`scripts/fake-connector.ts` drives a full task from the command line and accepts
flags to induce the §10.2 failure modes by hand. Task 6 ships no UI and so has no
Playwright coverage; this script is the vehicle for observing real behaviour, and
doubles as the reference implementation Task 7's macOS connector is written
against.

## 11. Out of Scope

Deliberately excluded, with the task that owns each:

- **Per-kind result payload schemas** — Tasks 10 and 11, which introduce the
  code paths that would exercise them (§7.3).
- **A paused state for `connector_outdated`** — Task 8, with the managed update
  flow that makes it resumable (§7.4).
- **Default provider per user** (`ai_connections`) — Settings → AI connections;
  §6 of the governing design. Task 6 takes `provider` as an explicit input.
- **PRD version in the manifest** — Task 11. No nullable placeholder column is
  added now: a field that is always null cannot be tested and is
  indistinguishable from a defect until it acquires meaning.
- **Web API routes for `resolve_ai_task`** — Task 10 (§6.5).
- **Pairing and the macOS connector** — Task 7.
- **Codex and Claude adapters, provider execution** — Task 8.
- **Room UI for task status and streamed events** — Task 10.
- **Multi-instance gateway deployment** — requires replacing in-process socket
  tracking with a shared liveness signal (§8.3).
