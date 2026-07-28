# Durable AI Tasks and Device Gateway Design

**Date:** 2026-07-28
**Status:** Draft — revised twice after review, pending re-approval
**Implements:** Task 6 of `docs/design/plans/2026-07-24-personal-ai-product-lifecycle-mvp.md`
**Governed by:** `docs/design/specs/2026-07-25-provider-connection-model-design.md`

## 1. Decision

Meld gains a durable AI task record and a standalone device gateway. A task is
created by the web application under the initiating user's session, persisted
with a frozen room-scoped context manifest, and executed later by that user's own
paired Mac. The gateway terminates device WebSocket connections, but holds no
authoritative state: PostgreSQL owns every status transition.

Three properties define the feature:

1. A task survives gateway restart, device restart, and network loss. **Only the
   current attempt may persist events or a terminal result** — see §1.1 for what
   this does and does not guarantee.
2. A task runs only on the initiating user's own device, and only if that user
   still has access to the room at the moment of execution.
3. The device receives bounded room content, never database access, storage
   URLs, or credentials.

### 1.1 Exactly-once acceptance, not exactly-once execution

Attempt fencing (§3) guarantees that at most one attempt's events and terminal
result are ever persisted. It does **not** guarantee that a provider process runs
only once. During a partition longer than the lease, the original provider
process may still be executing while the server requeues the task and a second
attempt begins. Fencing makes the first attempt's output unpersistable; it cannot
reach into the connector and stop the work.

This matters beyond correctness, because the governing design charges model usage
to the user's own subscription: a silently doubled execution spends their
allowance twice. Two mitigations, neither of which is fencing:

- **Connector self-fencing.** A connector that cannot renew a lease within the
  lease window must abort its provider child process group rather than run to
  completion. This is an interface obligation on Task 7 and Task 8, recorded in
  §12, and it closes the common case where the connector is alive but
  unreachable.
- **No silent retry of work that demonstrably started.** Lease reaping (§6.7)
  auto-requeues only attempts that produced **no** events. An attempt that
  emitted events began real execution, so it goes to `needs_review` with
  `execution_abandoned` and the user decides via `resolve_ai_task`. This reuses
  the existing status and RPC rather than adding a mechanism.

The residual window — a connector partitioned before its first event and unable
to self-fence — is accepted and documented rather than solved, because closing it
requires device-side execution journaling that only Task 7 can implement.

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

This replaces device liveness as the recovery signal. Keying staleness on
`execution_devices.last_seen_at` is unsound in both directions: a connector that
restarts and resumes heartbeats keeps its device row fresh while its abandoned
task stays `running` forever, and a task requeued after a partition could be
completed by the original process, because a frame carrying only `taskId` is
indistinguishable from one sent by the current attempt.

- `claim_ai_task` sets `attempt_id = gen_random_uuid()` and
  `lease_expires_at = now() + ai_task_lease_duration()`.
- `task.payload` carries `attemptId`. Every device→server task frame
  (`task.event`, `task.complete`, `task.fail`, `task.cancelled`) carries it, as
  does the server's `task.cancel`.
- Every event and terminal operation validates, inside the same row lock, that
  the presented `attempt_id` equals the stored one and that
  `lease_expires_at > now()`. A mismatch raises `stale_ai_task_attempt`.
- The device renews by including `activeTasks: [{ taskId, attemptId }]` on its
  existing 30-second `heartbeat`, which calls `renew_ai_task_leases` (§6.6).
  Reusing the heartbeat avoids a second liveness mechanism with its own timing.

**Lease duration lives in the database**, as the immutable SQL function
`ai_task_lease_duration()` returning `interval '90 seconds'` — three missed
heartbeats. PostgreSQL cannot read the gateway's environment, so a
`GATEWAY_TASK_LEASE_MS` variable would have been either unused or a second
source of truth that could disagree with the value actually enforced. The gateway
configures only its heartbeat cadence.

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
from the device's owner — the idiom already used in this schema, where `mentions`
references `messages (id, room_id)` the same way.

The table has no column for an executable path, credential path, environment
value, or provider response body, so the `provider.status` security boundary is
enforced by schema rather than by reviewer discipline.

### 4.3 `ai_tasks`

`id`, `initiating_user_id`, `organization_id`, `room_id`, `device_id`,
`provider`, `kind`, `status`, `instruction`, `context_manifest_json`,
`context_revision`, `attempt_id`, `lease_expires_at`, `terminal_attempt_id`,
`result_json`, `error_code`, `error_message`, `cancelled_at`, `created_at`,
`updated_at`.

Two composite foreign keys carry the authorization invariants that would
otherwise depend on a policy being written correctly:

- **`(device_id, initiating_user_id)` → `execution_devices (id, user_id)`** — a
  task physically cannot reference another user's device.
- **`(room_id, organization_id)` → `discovery_rooms (id, organization_id)`** — a
  task's organisation cannot disagree with its room's. Requires adding
  `unique (id, organization_id)` to `discovery_rooms`.

`terminal_attempt_id` records which attempt produced the terminal outcome, and
survives the clearing of `attempt_id`. Without it, a connector whose
`task.complete` committed just before the connection dropped could not
distinguish "my result was accepted" from "I was fenced" on retry (§7.5).

`context_manifest_json` stores authorized message, attachment, evidence, and
decision IDs — never signed URLs, storage paths, or copied room bodies. Its size
and element counts are bounded per §8.

### 4.4 `ai_task_events`

`task_id` → `ai_tasks`, `attempt_id`, `sequence`, `type`, `payload_json`,
`created_at`, with primary key **`(task_id, attempt_id, sequence)`**.

`attempt_id` is part of the key because sequence numbering restarts at 1 for each
attempt; without it a retried task's first event would collide with the previous
attempt's. It is a plain column rather than a foreign key: `ai_tasks.attempt_id`
holds only the *current* attempt and is cleared when the task leaves `running`,
so a reference would break exactly when the history becomes worth keeping.

The primary key provides uniqueness only. **Ordering is enforced procedurally**
in `append_ai_task_event` (§6.5), not by the key — a unique constraint permits
sequence 7 to arrive before sequence 1.

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
is what invalidates a superseded attempt. Terminal transitions first record
`terminal_attempt_id`.

Cancellation-cannot-complete needs no special handling: a device finishing work
after cancellation calls `transition_ai_task(id, 'completed', 'running')`, which
fails because the stored status reads `cancelled`.

## 6. Database Functions

| Function | Caller | Behaviour |
| --- | --- | --- |
| `ai_task_lease_duration()` | internal | Immutable `interval '90 seconds'` (§3). |
| `transition_ai_task(task, to, from)` | internal | Compare-and-swap described in §5. |
| `create_ai_task(room, device, provider, kind, instruction, manifest)` | `authenticated` | §6.1. |
| `cancel_ai_task(task)` | `authenticated` | Asserts `auth.uid() = initiating_user_id`, transitions to `cancelled`, sets `cancelled_at`. |
| `resolve_ai_task(task, action)` | `authenticated` | §6.2. |
| `claim_ai_task(task, device)` | `service_role` | §6.3. |
| `hydrate_authorized_room_context(task, attempt)` | `service_role` | §6.4. |
| `append_ai_task_event(task, device, attempt, sequence, type, payload)` | `service_role` | §6.5. |
| `renew_ai_task_leases(device, attempts)` | `service_role` | §6.6. |
| `complete_ai_task(task, device, attempt, result, partial)` | `service_role` | §7.5. `partial = false` → `completed`, `partial = true` → `needs_review`. |
| `fail_ai_task(task, device, attempt, code, message)` | `service_role` | §7.5; target status derived from `code` per §7.4. |
| `reap_expired_ai_task_leases()` | `service_role` | §6.7. |

Execute permission is granted to `authenticated` only for `create_ai_task`,
`cancel_ai_task`, and `resolve_ai_task`, and to `service_role` only for the
gateway functions. `transition_ai_task` and `ai_task_lease_duration` are granted
to neither. `insert`, `update`, and `delete` on `ai_tasks` and `ai_task_events`
are revoked from `authenticated` entirely; `select` remains under RLS so the room
UI can read task state in Task 10.

### 6.1 Creation is an RPC, not a client insert

A plain insert cannot express the required invariants, because the client
supplies `organization_id` and `device_id`. `create_ai_task` is
`security definer` and derives rather than trusts:

1. `initiating_user_id := auth.uid()`.
2. `organization_id` is read from the room, never accepted as an argument.
3. Asserts the caller participates in the room.
4. Asserts the device is `active`, not revoked, and owned by `auth.uid()`.
5. Asserts a `provider_connections` row exists for `(device_id, provider)`.
6. Validates the manifest references only records the caller can currently read,
   and satisfies the bounds in §8.

The composite foreign keys in §4.3 make steps 2 and 4 unfalsifiable even if this
function were later modified incorrectly. Defence in depth is warranted because
the failure mode is one user's content executing on another user's machine.

### 6.2 `resolve_ai_task`

Authenticated, asserts `auth.uid() = initiating_user_id`, and takes an action:

| Action | Valid from | To |
| --- | --- | --- |
| `retry` | `needs_reauthentication`, `usage_limit_reached`, `needs_review` | `ready_to_run` |
| `accept` | `needs_review` | `completed` |
| `discard` | `needs_review` | `cancelled` |

These are the "Keep partial draft / Retry / Discard" and re-authentication
recoveries the governing design §8 requires, and the user-confirmed retry that
§1.1 depends on. The web API surface is Task 10's; this task provides the RPC and
the state-machine edges so those statuses are not dead ends.

### 6.3 Claiming

`FOR UPDATE SKIP LOCKED` on the task row; asserts `ai_tasks.device_id = device`;
transitions `ready_to_run → running`; mints `attempt_id` and `lease_expires_at`;
returns both. Owner equality is guaranteed by the composite foreign key rather
than re-checked.

### 6.4 `hydrate_authorized_room_context` is the security-critical function

The gateway runs as service-role, so RLS does not protect this path. The function
re-derives access from first principles rather than trusting the manifest: it
returns only those manifest-listed messages, attachments, evidence, and decisions
that `initiating_user_id` can reach **at call time**, and includes only validated
extracted attachment text plus user captions. It validates the attempt, so a
stale claim cannot pull context, and enforces the §8 size ceiling.

If access changed since creation, the task transitions to `failed` with
`permission_changed` and no context is emitted — satisfying the governing
design's §8 requirement that queued work cannot outlive a revocation. Performing
it in SQL yields one atomic read of access-plus-content and is directly
pgTAP-testable.

### 6.5 Event append: lookup first, then ordering

The replay check must precede the ordering check. An exact replay necessarily
carries a sequence at or below the current maximum, so testing `max + 1` first
would reject the very case replay handling exists to serve. Within one
transaction, `append_ai_task_event`:

1. Takes `FOR UPDATE` on the task row.
2. Requires the presented `attempt_id` to match and the lease to be unexpired,
   raising `stale_ai_task_attempt` otherwise.
3. Requires `status = 'running'`, so cancelled, failed, and completed tasks
   cannot continue receiving events.
4. **Looks up `(task_id, attempt_id, sequence)`.** If a row exists: identical
   `type` and `payload_json` return that sequence for idempotent
   re-acknowledgement; anything else raises `conflicting_ai_task_event`. No
   insert occurs and no ordering check applies.
5. Otherwise requires `sequence = coalesce(max(sequence), 0) + 1` for that
   `(task_id, attempt_id)` — the first event of an attempt is sequence 1 —
   raising `out_of_order_ai_task_event` if not, and inserts.
6. Renews the lease, since event traffic is itself proof of liveness.

### 6.6 `renew_ai_task_leases`

Takes a device and an array of `(task_id, attempt_id)` pairs. For each, extends
`lease_expires_at` to `now() + ai_task_lease_duration()` only where the task is
`running`, `device_id` matches, and `attempt_id` matches. Non-matching entries
are ignored rather than raising, because a device legitimately learns of fencing
only from the response. Returns the set actually renewed, which the gateway
relays so the connector can abort work on tasks it no longer holds — the
self-fencing signal §1.1 depends on. The array is capped at 32 entries (§8);
longer input is rejected.

### 6.7 Lease reaping

`reap_expired_ai_task_leases` finds `running` tasks whose `lease_expires_at` has
passed and, per §1.1, splits them:

- **No events recorded for the attempt** → `waiting_for_device`, attempt cleared,
  eligible for automatic re-announcement. Nothing observably ran.
- **Events recorded** → `needs_review` with `error_code = execution_abandoned`,
  preserving the partial event stream. The user retries or discards via
  `resolve_ai_task`.

It reads no device state.

## 7. Protocol and Contract Changes

The current contracts cannot validate or express what this design promises, so
`packages/contracts` changes alongside the migration:

- `ai.ts` — `AIContextPackageSchema` gains `evidence` and `decisions` (§7.1).
- `ws.ts` — `task.payload` and `task.cancel` gain `attemptId`; `task.event`,
  `task.complete`, `task.fail`, and `task.cancelled` each gain `attemptId`;
  `heartbeat` gains `activeTasks: { taskId, attemptId }[]` (§3).
- `ws.ts` — three new server→device frames (§7.5).
- `ws.ts` — `task.event.event` becomes the bounded `TaskEventSchema` union
  (§7.2); `TaskErrorCodeSchema` gains `execution_abandoned` (§6.7); size caps
  applied per §8.

### 7.1 Context package gains evidence and decisions

`AIContextPackageSchema` (`ai.ts:58`) has no `evidence` or `decisions` fields, so
a manifest recording their IDs could not deliver them. Adding, with the same
bounded shape as `messages` and `attachments`:

- `evidence: { id, title, note }[]`
- `decisions: { id, summary, sourceMessageId }[]`

### 7.2 Events become a bounded union

`task.event` currently accepts `z.record(z.string(), z.unknown())`
(`ws.ts:64`), so "validates every frame with Zod" is not true of event content.
`TaskEventSchema` becomes a discriminated union with explicit caps:

- `{ type: "progress", label: string.max(200), percent?: 0–100 }`
- `{ type: "text.delta", text: string.max(10_000) }`
- `{ type: "notice", code: TaskErrorCode, message: string.max(2_000) }`

Unknown event types are rejected at the boundary, matching the governing design
§7 requirement that the connector reject unknown tool, file, or subprocess
events — the gateway applies the same rule in the other direction.

### 7.3 Per-kind result schemas are deferred

`AIResultEnvelope.payload` remains `z.unknown()` under the §8 size cap. Per-kind
schemas are deliberately deferred: `prd_generate` validates against
`PRDDocumentSchema` only once PRD tables exist (Task 11), and `room_reply` once
the room renders results (Task 10). Defining them now means writing validation no
code path can exercise. The size caps and the bounded event union constrain the
boundary in this task; §12 records the deferral.

### 7.4 Error codes map to statuses

`fail_ai_task` deriving a single terminal `failed` would contradict the resumable
states the governing design §8 requires. The mapping:

| `task_error_code` | Status |
| --- | --- |
| `authentication_required` | `needs_reauthentication` |
| `usage_limit_reached` | `usage_limit_reached` |
| `malformed_output`, `execution_abandoned` | `needs_review` — partial output preserved |
| `cancelled` | `cancelled` |
| `permission_changed`, `security_boundary_violated`, `provider_unavailable`, `provider_install_failed`, `unknown` | `failed` |
| `connector_outdated` | `failed` — see below |

`connector_outdated` is an accepted gap. The governing design §8 says an
unsupported provider version should *pause* and offer a managed update, but
`ai_task_status` has no state for it. Inventing one now adds a status no code
path in this task can enter or leave. Task 8 owns provider version management and
adds the state with the update flow that makes it resumable; until then the code
is recorded on a `failed` task and the user re-runs.

### 7.5 Acknowledgement and rejection frames

The server→device union carries no way to reject an operation or confirm a
terminal one, so the typed failures described elsewhere have no wire
representation. Three frames are added:

- `task.claim_rejected { taskId, reason }` — lost race, revalidation failure, or
  no longer claimable.
- `task.operation_rejected { taskId, attemptId, operation, reason }` — carries
  `stale_ai_task_attempt`, `out_of_order_ai_task_event`, and
  `conflicting_ai_task_event`.
- `task.terminal_ack { taskId, attemptId, status }` — confirms a durably
  recorded terminal outcome.

`complete_ai_task` and `fail_ai_task` are idempotent against
`terminal_attempt_id`: if the task is already terminal and the presented attempt
equals `terminal_attempt_id`, they re-emit `task.terminal_ack` rather than
raising `stale_ai_task_attempt`. A connector whose completion committed as the
connection dropped therefore learns on retry that its work was accepted, instead
of being told it was fenced and — under §1.1 — leaving the user to adjudicate a
task that actually succeeded.

## 8. Content Bounds

"Bounded room content" must hold end to end, not only on event frames. Every
limit below is asserted in tests, and the database and gateway limits are set
consistently so a frame the gateway accepts cannot be rejected by a constraint
mid-stream.

| Boundary | Limit | Enforced at |
| --- | --- | --- |
| WebSocket frame | 1 MiB | `@fastify/websocket` `maxPayload` |
| Event payload | 64 KiB | Zod, `check` on `ai_task_events.payload_json` |
| Result payload | 256 KiB | Zod, `check` on `ai_tasks.result_json` |
| Instruction | 20 000 chars | Zod (existing), `check` on `ai_tasks.instruction` |
| Manifest element counts | 500 messages, 50 attachments, 100 evidence, 100 decisions | `create_ai_task` |
| Manifest JSON | 256 KiB | `check` on `ai_tasks.context_manifest_json` |
| Hydrated context package | 512 KiB | `hydrate_authorized_room_context`, leaving frame headroom under `maxPayload` |
| `activeTasks` per heartbeat | 32 | Zod, `renew_ai_task_leases` |

A hydrated context exceeding its ceiling fails the task with `unknown` rather
than truncating, because silently dropping authorized content would change what
the provider reasons about without telling anyone.

## 9. Gateway

```
apps/gateway/src/
  main.ts                    entrypoint: listen, signal handling, shutdown
  server.ts                  Fastify, /health, WebSocket upgrade route
  auth/device-token.ts       mint / hash / constant-time verify  (shared)
  auth/device-auth.ts        upgrade-time authentication
  tasks/task-repository.ts   service-role client, one wrapper per §6 function
  ws/device-session.ts       per-connection state, heartbeat, lease renewal
  ws/protocol-handler.ts     frame routing, Zod validation, sequencing
  dispatch/sweeper.ts        poll, announce, reap
```

### 9.1 Making the package runnable

The package declares only `lint`, `test`, and `typecheck` (`package.json:6-10`),
sets `noEmit: true` (`tsconfig.json:7`), and nothing calls `listen()`.

`tsc` alone cannot fix this. `@meld/contracts` exports `./src/index.ts` directly
(`packages/contracts/package.json:7`) with `noEmit` and no build script, so
compiled gateway output would import a TypeScript file that Node 20 cannot load;
`moduleResolution: "Bundler"` additionally emits extensionless relative
specifiers that Node's ESM resolver rejects. Both problems disappear if the
gateway is bundled:

- `tsup` (devDependency) bundles `src/main.ts` to ESM in `dist/`, with runtime
  dependencies external and `@meld/contracts` inlined via `noExternal`. Contracts
  keeps its TypeScript-only export, so the web app's resolution is untouched.
- Scripts: `build: "tsup"`, `start: "node dist/main.js"`,
  `dev: "tsx watch src/main.ts"`, and `test:integration` (§11.4), with the
  existing `test` script excluding `*.integration.test.ts` so it stays
  database-free.
- `tsconfig.json` keeps `noEmit: true`; type checking and emission are now
  separate concerns.
- `main.ts` binds `GATEWAY_PORT` and, on `SIGINT`/`SIGTERM`, stops the sweeper,
  closes sockets with code `1001`, and awaits in-flight database calls.
- Dependencies pinned exactly per repository convention: `@fastify/websocket`,
  `@supabase/supabase-js`, `@meld/contracts`, `zod`; `tsx` and `tsup` as
  devDependencies.

Because `pnpm build` runs `turbo build`, CI exercises this bundle on every run,
so the packaging cannot rot unnoticed.

`scripts/seed-device.ts` and `scripts/fake-connector.ts` are TypeScript run via
`pnpm exec tsx`, not `.mjs`. Plain Node cannot import `auth/device-token.ts`, and
duplicating the credential format in a `.mjs` file would defeat the single
implementation Task 7's pairing flow is meant to reuse.

`scripts/check-test-colocation.mjs` currently runs against `apps/web` only; CI
extends it to `apps/gateway`.

Configuration: `GATEWAY_PORT`, `GATEWAY_SUPABASE_URL`,
`GATEWAY_SUPABASE_SERVICE_ROLE_KEY`, `GATEWAY_POLL_INTERVAL_MS` (default 3000),
`GATEWAY_HEARTBEAT_SECONDS` (default 30). Lease duration is deliberately absent —
it belongs to the database (§3). Added to `.env.example`.

### 9.2 Device authentication

The upgrade requires `Authorization: Device <deviceId>.<secret>`. The gateway
hashes the presented secret, fetches the device by ID, and compares with
`timingSafeEqual`. When no device row exists it compares against a fixed dummy
digest, so response timing does not disclose device existence. A missing,
malformed, mismatched, or revoked credential returns `401` and no socket is
established. Success updates `last_seen_at`, records `connector_version`, and
emits `session.accepted { heartbeatSeconds }`.

`auth/device-token.ts` owns secret generation (32 random bytes, base64url) and
hashing; the seed script and Task 7's pairing flow both call it.

### 9.3 Dispatch is announce-by-state, not announce-on-transition

Each sweep, for every connected device:

1. `queued` tasks → `ready_to_run`; `waiting_for_device` tasks → `ready_to_run`.
2. `queued` tasks for absent devices → `waiting_for_device`.
3. **Announce `task.available` for every `ready_to_run` task**, regardless of
   whether this sweep transitioned it.
4. Reap expired leases (§6.7).

Step 3 is stated separately because transitioning and announcing cannot be made
atomic across a database and a socket. A gateway that crashed between committing
`queued → ready_to_run` and writing the frame would otherwise strand the task:
it is neither `queued` nor `waiting_for_device`, so no later sweep or reconnect
would revisit it. Announcing from current state rather than from the transition
makes the frame a repeatable statement of fact instead of a one-shot
notification, which is also why re-announcement is harmless — `task.available`
carries no state, and a device already working the task ignores it.

Device connection runs the same logic scoped to that device, so a reconnecting
device is told about its `ready_to_run` tasks as well as its `waiting_for_device`
ones.

"Currently connected" is read from the sweeper's in-process socket set, which
assumes a **single gateway instance**; two instances would each hold a partial
view. This is acceptable now — the gateway is not deployed (§12) — and no
correctness property depends on it, because claiming is safe under `SKIP LOCKED`
and every operation is attempt-validated regardless of instance count. The
failure mode is a delayed task, never a duplicated or misrouted one.

### 9.4 Frame flow

`task.claim` → `claim_ai_task` → `hydrate_authorized_room_context` → exactly one
`task.payload` carrying `attemptId`, or `task.claim_rejected`.

`task.event` → `append_ai_task_event` → `task.event_ack` or
`task.operation_rejected`. `task.complete`, `task.fail`, and `task.cancelled` are
terminal for the attempt and answered with `task.terminal_ack`.

`heartbeat` → `renew_ai_task_leases` → the renewed set, so the connector can
abort tasks it no longer holds. A user cancellation reaches the device as
`task.cancel` carrying the current `attemptId` on the next sweep.

`provider.status` upserts `provider_connections` on `(device_id, provider)`.

## 10. Error Handling

| Condition | Response |
| --- | --- |
| Bad, revoked, or malformed credential | `401` at upgrade; no socket |
| Frame fails Zod validation, or exceeds `maxPayload` | Close `1008`; a correct connector never emits one |
| Exact event replay | `task.event_ack` with the stored sequence (§6.5) |
| Same sequence, differing type or payload | `task.operation_rejected` / `conflicting_ai_task_event`; close `1008` |
| Out-of-order sequence | `task.operation_rejected` / `out_of_order_ai_task_event`; close `1008` |
| Frame from a superseded attempt | `task.operation_rejected` / `stale_ai_task_attempt`; socket left open — losing a lease is a race a correct connector cannot always avoid, unlike a protocol violation |
| Terminal retry from the attempt that already succeeded | `task.terminal_ack` (§7.5) |
| Event for a non-`running` task | Rejected by §6.5 step 3 |
| Claim lost to another connection | `task.claim_rejected`; no context emitted |
| Access revoked between create and claim | `failed` / `permission_changed`; no context emitted |
| Lease expires with no events recorded | `waiting_for_device`; re-announced automatically |
| Lease expires with events recorded | `needs_review` / `execution_abandoned`; user decides (§1.1) |
| Missed heartbeats | Socket closed; tasks recovered by lease expiry, not socket state |
| Provider sign-out, allowance, partial output | Mapped per §7.4; resumed via `resolve_ai_task` |

## 11. Testing

### 11.1 pgTAP — `supabase/tests/ai_task_transitions.test.sql`

Legal and illegal transitions including the two cases named in the MVP plan;
cancel-then-complete rejected; event ordering (gap rejected, out-of-order
rejected, exact replay acknowledged, conflicting payload rejected); events
rejected for non-`running` tasks; stale-attempt rejection; terminal replay
returning acknowledgement rather than a stale error; lease renewal ignoring
non-matching pairs; both reaping branches of §6.7; error-code-to-status mapping;
`resolve_ai_task` transitions; `create_ai_task` rejecting another user's device,
a revoked device, a non-participant room, a provider with no connection, and each
bound in §8; hydration returning nothing once room access is revoked.

### 11.2 Integration — `apps/gateway/src/**/*.integration.test.ts`

pgTAP executes in a single session inside one transaction, so it **cannot**
exercise `SKIP LOCKED` contention or lease expiry across concurrent
transactions. These run in vitest against a local Supabase stack and a live
gateway, using two independent service-role connections where contention is the
subject:

- two devices race one task; exactly one claim succeeds, the loser receives
  `task.claim_rejected`, one context is emitted;
- gateway restarts after a claim; the task is recovered and completes;
- **gateway is killed after `queued → ready_to_run` commits but before
  `task.available` is written**; the next sweep re-announces it (§9.3);
- connector restarts mid-run; the resumed attempt is rejected as stale and the
  requeued task completes under a new attempt;
- a lease expires with the socket still open; the superseded attempt's
  `task.complete` is rejected and does not overwrite the new attempt's result;
- a completion commits as the connection drops; the retried terminal operation
  returns `task.terminal_ack` (§7.5);
- lease expiry with zero events requeues; with events, lands in `needs_review`;
- cancellation lands mid-execution; no event or completion is accepted after it;
- an event stream with a deliberate gap and a deliberate replay.

These are the feature's defining properties, so they are automated rather than
left to the manual script.

### 11.3 Unit

Gateway vitest, colocated: `device-token` round-trip, `device-auth` rejection
paths and unknown-device timing, `protocol-handler` per-frame validation and
close conditions. Web vitest: `task-service` manifest construction, asserting the
manifest carries identifiers only, with no storage paths or bodies.

### 11.4 CI wiring

Neither existing job can run §11.2: `validate` installs Node dependencies but
starts no database, and `database` runs `supabase db start` — Postgres only, per
its own comment — with no Node toolchain, while `supabase-js` needs PostgREST.

A new `gateway-integration` job is added:

1. `actions/checkout`, `pnpm/action-setup`, `actions/setup-node` (20.19.0),
   `supabase/setup-cli` (2.109.1) — the versions the other jobs already pin.
2. `pnpm install --frozen-lockfile`.
3. `supabase start` — the full stack, not `db start`.
4. Poll `supabase status` until the API is ready before running tests, so a slow
   container surfaces as a timeout rather than a flake.
5. `pnpm --filter @meld/gateway test:integration`, with
   `GATEWAY_SUPABASE_URL` and `GATEWAY_SUPABASE_SERVICE_ROLE_KEY` read from
   `supabase status -o env`.
6. `supabase stop --no-backup` in an `always()` step.

The integration suite is excluded from the default `vitest run` by filename so
`pnpm test:workspace` in `validate` stays database-free, and is run only by this
job. Its absence from CI would otherwise be invisible — the suite would pass
locally and never execute on a pull request.

### 11.5 Manual

`scripts/fake-connector.ts` drives a full task from the command line and accepts
flags to induce the §11.2 failure modes by hand. Task 6 ships no UI and so has no
Playwright coverage; this script is the vehicle for observing real behaviour, and
doubles as the reference implementation Task 7's macOS connector is written
against.

## 12. Out of Scope

Deliberately excluded, with the task that owns each:

- **Connector-side self-fencing and execution journaling** — Task 7, as the
  interface obligation §1.1 depends on: a connector that cannot renew a lease
  must abort its provider child process group.
- **Per-kind result payload schemas** — Tasks 10 and 11, which introduce the code
  paths that would exercise them (§7.3).
- **A paused state for `connector_outdated`** — Task 8, with the managed update
  flow that makes it resumable (§7.4).
- **Default provider per user** (`ai_connections`) — Settings → AI connections;
  §6 of the governing design. Task 6 takes `provider` as an explicit input.
- **PRD version in the manifest** — Task 11. No nullable placeholder column is
  added now: a field that is always null cannot be tested and is
  indistinguishable from a defect until it acquires meaning.
- **Web API routes for `resolve_ai_task`** — Task 10 (§6.2).
- **Pairing and the macOS connector** — Task 7.
- **Codex and Claude adapters, provider execution** — Task 8.
- **Room UI for task status and streamed events** — Task 10.
- **Multi-instance gateway deployment** — requires replacing in-process socket
  tracking with a shared liveness signal (§9.3).
