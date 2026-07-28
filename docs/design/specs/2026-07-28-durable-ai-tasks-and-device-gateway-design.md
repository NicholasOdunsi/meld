# Durable AI Tasks and Device Gateway Design

**Date:** 2026-07-28
**Status:** Draft — revised three times after review, pending re-approval
**Implements:** Task 6 of `docs/design/plans/2026-07-24-personal-ai-product-lifecycle-mvp.md`
**Governed by:** `docs/design/specs/2026-07-25-provider-connection-model-design.md`

## 1. Decision

Meld gains a durable AI task record and a standalone device gateway. A task is
created by the web application under the initiating user's session, persisted
with a frozen room-scoped context manifest, and executed later by that user's own
paired Mac. The gateway terminates device WebSocket connections, but holds no
authoritative state: PostgreSQL owns every status transition.

Three properties define the feature:

1. A task survives gateway restart, device restart, and network loss. **Events
   and results are accepted only from the attempt that is current when they
   arrive** — see §1.1.
2. A task runs only on the initiating user's own device, and only if that user
   still has access to the room at the moment of execution.
3. The device receives bounded room content, never database access, storage
   URLs, or credentials.

### 1.1 What the guarantee is, precisely

Attempt fencing (§3) guarantees that **at any moment at most one attempt may
write**, and that a settled attempt can never write again. It does *not* mean
only one attempt's events exist: superseded attempts' event streams are
deliberately retained (§4.5) as an execution audit trail. Acceptance is
exclusive; persistence is cumulative.

Consequently, **the authoritative stream for a task is exactly one attempt**: the
unsettled attempt while the task is `running`, otherwise the most recently
settled one. Task 10 renders that attempt alone and never merges streams —
concatenating a superseded attempt's text deltas with a retry's would produce
text no provider ever emitted.

Nor does fencing guarantee a provider process runs only once. During a partition
longer than the lease, the original process may still be executing while the
server settles its attempt and a second one begins. Fencing makes the first
attempt's output unpersistable; it cannot reach into the connector and stop the
work. That matters beyond correctness, because the governing design charges model
usage to the user's own subscription — a silently doubled execution spends their
allowance twice. Two mitigations:

- **Connector self-fencing.** A connector that cannot renew a lease within the
  lease window must abort its provider child process group rather than run to
  completion. This is an interface obligation on Tasks 7 and 8, recorded in §13.
- **No silent retry of work that demonstrably started.** Reaping (§6.9)
  auto-requeues only attempts that produced **no** events. An attempt that
  emitted events began real execution, so it settles into `needs_review` with
  `execution_abandoned` and the user decides via `resolve_ai_task`.

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
enforce — it is a transport, not an authority, and §6.10 removes its ability to
be one.

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

## 3. Attempts

An execution **attempt** is the unit of durability, and it is a row, not three
columns on the task. Claiming inserts an `ai_task_attempts` row holding the lease
and, later, the settled outcome; every device operation names its attempt.

This replaces device liveness as the recovery signal. Keying staleness on
`execution_devices.last_seen_at` is unsound in both directions: a connector that
restarts and resumes heartbeats keeps its device row fresh while its abandoned
task stays `running` forever, and a task requeued after a partition could be
completed by the original process, because a frame carrying only `taskId` is
indistinguishable from one sent by the current attempt.

An attempt is **current** while `settled_at is null`, and a partial unique index
permits only one such row per task. It is **settled** once any operation moves
the task out of `running` — including the operations that leave the task in a
non-terminal state. Settling records the outcome, the operation, and a
fingerprint of its content, which is what makes retries idempotent (§7.5).

- `claim_ai_task` inserts an attempt with
  `lease_expires_at = now() + ai_task_lease_duration()`.
- `task.payload` carries `attemptId`, as does every device→server task frame and
  the server's `task.cancel`.
- Every write validates, inside the same row lock, that the attempt is current,
  belongs to the presenting device, and that `lease_expires_at > now()`.
  Otherwise `stale_ai_task_attempt`.
- The device renews via `activeTasks: [{ taskId, attemptId }]` on its 30-second
  `heartbeat`, calling `renew_ai_task_leases` (§6.7).

**Lease duration lives in the database**, as the immutable SQL function
`ai_task_lease_duration()` returning `interval '90 seconds'`. PostgreSQL cannot
read the gateway's environment, so a `GATEWAY_TASK_LEASE_MS` variable would be
either unused or a second source of truth that could disagree with the value
actually enforced.

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
`context_revision`, `result_json`, `error_code`, `error_message`, `cancelled_at`,
`created_at`, `updated_at`, plus **`unique (id, device_id)`**.

Attempt state is deliberately absent — it belongs to §4.4.

Two composite foreign keys carry the authorization invariants that would
otherwise depend on a policy being written correctly:

- **`(device_id, initiating_user_id)` → `execution_devices (id, user_id)`** — a
  task physically cannot reference another user's device.
- **`(room_id, organization_id)` → `discovery_rooms (id, organization_id)`** — a
  task's organisation cannot disagree with its room's. Requires adding
  `unique (id, organization_id)` to `discovery_rooms`.

`context_manifest_json` stores authorized message, attachment, evidence, and
decision IDs — never signed URLs, storage paths, or copied room bodies. Its size
and element counts are bounded per §8.

### 4.4 `ai_task_attempts`

`id`, `task_id` → `ai_tasks`, `device_id`, `attempt_no`, `started_at`,
`lease_expires_at`, `settled_at`, `outcome` (`ai_task_status`),
`settle_operation` (`complete` | `fail` | `cancelled`), `settle_fingerprint`,
`cancel_requested_at`, `cancel_acknowledged_at`, with
`unique (id, task_id)`, `unique (task_id, attempt_no)`, a composite foreign key
`(task_id, device_id)` → `ai_tasks (id, device_id)`, and:

```sql
create unique index ai_task_attempts_one_current
  on public.ai_task_attempts (task_id) where settled_at is null;
```

The partial unique index is what makes "at most one attempt may write" a schema
guarantee rather than a procedural one.

Every transition out of `running` settles the attempt — **including transitions
to non-terminal statuses**. Partial completion (`needs_review`), authentication
failure (`needs_reauthentication`), usage exhaustion (`usage_limit_reached`), and
abandonment all end the attempt even though the task lives on. Recording settled
state only for globally terminal tasks would mean a lost acknowledgement on any
of those paths produced `stale_ai_task_attempt` on retry, telling a connector it
was fenced when in fact its work was recorded.

`settle_fingerprint` is a SHA-256 over the canonical JSON of the settling
operation and its content. It is what distinguishes a retry from a contradiction
(§7.5).

`cancel_requested_at` and `cancel_acknowledged_at` carry cancellation delivery
(§6.8), which needs durable state to survive a gateway restart without either
losing the cancellation or resending it forever.

### 4.5 `ai_task_events`

`task_id`, `attempt_id`, `sequence`, `type`, `payload_json`, `created_at`, with
primary key **`(attempt_id, sequence)`** and a composite foreign key
`(attempt_id, task_id)` → `ai_task_attempts (id, task_id)`.

Sequence numbering restarts at 1 per attempt, so the attempt must be part of the
key. Superseded attempts' events are retained as an audit trail; §1.1 defines
which single attempt is authoritative for rendering.

The primary key provides uniqueness only. **Ordering is enforced procedurally**
in `append_ai_task_event` (§6.6) — a unique constraint permits sequence 7 to
arrive before sequence 1.

### 4.6 Enum parity

PostgreSQL enums mirror the Zod enums in `packages/contracts` — `provider`,
`ai_task_kind`, `ai_task_status`, the three provider-status enums from `ai.ts`,
and `task_error_code` from `ws.ts`. Divergence would be invisible until runtime,
so `scripts/check-contract-enum-parity.mjs` parses the migration with
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

Every transition out of `running` settles the current attempt in the same
transaction, recording `settled_at`, `outcome`, `settle_operation`, and
`settle_fingerprint`. Settling is what invalidates a superseded attempt, and it
is unconditional on whether the resulting task status is terminal.

Cancellation-cannot-complete needs no special handling: a device finishing work
after cancellation calls `transition_ai_task(id, 'completed', 'running')`, which
fails because the stored status reads `cancelled`.

## 6. Database Functions

| Function | Caller | Behaviour |
| --- | --- | --- |
| `ai_task_lease_duration()` | internal | Immutable `interval '90 seconds'` (§3). |
| `transition_ai_task(task, to, from)` | internal | Compare-and-swap; settles the attempt (§5). |
| `create_ai_task(room, device, provider, kind, instruction, manifest)` | `authenticated` | §6.1. |
| `cancel_ai_task(task)` | `authenticated` | §6.8. |
| `resolve_ai_task(task, action)` | `authenticated` | §6.2. |
| `get_execution_device_for_auth(device)` | `service_role` | Returns `token_hash`, `status`, `user_id` for constant-time comparison in Node. |
| `record_device_connection(device, connector_version)` | `service_role` | Updates `last_seen_at`, `connector_version`. |
| `upsert_provider_connections(device, statuses)` | `service_role` | `provider.status` ingestion. |
| `list_dispatchable_ai_tasks(devices)` | `service_role` | §6.5 sweep input, including pending cancellations. |
| `claim_ai_task(task, device)` | `service_role` | §6.3. |
| `hydrate_authorized_room_context(task, attempt)` | `service_role` | §6.4. |
| `append_ai_task_event(task, device, attempt, sequence, type, payload)` | `service_role` | §6.6. |
| `renew_ai_task_leases(device, attempts)` | `service_role` | §6.7. |
| `acknowledge_task_cancellation(task, attempt, device)` | `service_role` | §6.8. |
| `settle_ai_task(task, device, attempt, operation, code, message, result, partial)` | `service_role` | §7.5. Single entry point for `complete`, `fail`, and `cancelled`. |
| `reap_expired_ai_task_leases()` | `service_role` | §6.9. |

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

Authenticated, asserts `auth.uid() = initiating_user_id`:

| Action | Valid from | To |
| --- | --- | --- |
| `retry` | `needs_reauthentication`, `usage_limit_reached`, `needs_review` | `ready_to_run` |
| `accept` | `needs_review` | `completed` |
| `discard` | `needs_review` | `cancelled` |

These are the "Keep partial draft / Retry / Discard" and re-authentication
recoveries the governing design §8 requires, and the user-confirmed retry §1.1
depends on. The web API surface is Task 10's.

### 6.3 Claiming

`FOR UPDATE SKIP LOCKED` on the task row; asserts `ai_tasks.device_id = device`;
transitions `ready_to_run → running`; inserts the attempt row with its lease.
Owner equality is guaranteed by the composite foreign key rather than re-checked.
The partial unique index (§4.4) is the backstop against a second current attempt.

### 6.4 `hydrate_authorized_room_context` is the security-critical function

The gateway runs as service-role, so RLS does not protect this path. The function
re-derives access from first principles rather than trusting the manifest: it
returns only those manifest-listed messages, attachments, evidence, and decisions
that `initiating_user_id` can reach **at call time**, and includes only validated
extracted attachment text plus user captions. It validates the attempt and
enforces the §8 size ceiling.

If access changed since creation, the task settles as `failed` with
`permission_changed` and no context is emitted — satisfying the governing
design's §8 requirement that queued work cannot outlive a revocation.

### 6.5 `list_dispatchable_ai_tasks`

Returns, for the supplied connected devices: `queued` and `waiting_for_device`
tasks needing promotion, all `ready_to_run` tasks needing announcement (§9.3),
and attempts with `cancel_requested_at is not null and cancel_acknowledged_at is
null` needing a `task.cancel`. One round trip per sweep, and the sweep holds no
policy of its own.

### 6.6 Event append: lookup first, then ordering

The replay check must precede the ordering check. An exact replay necessarily
carries a sequence at or below the current maximum, so testing `max + 1` first
would reject the case replay handling exists to serve. Within one transaction:

1. `FOR UPDATE` on the task row.
2. Requires the attempt to be current, owned by the device, and
   `lease_expires_at > now()`; else `stale_ai_task_attempt`.
3. Requires `status = 'running'`.
4. **Looks up `(attempt_id, sequence)`.** If present: identical `type` and
   `payload_json` return that sequence for idempotent re-acknowledgement;
   anything else raises `conflicting_ai_task_event`. No insert, no ordering check.
5. Otherwise requires `sequence = coalesce(max(sequence), 0) + 1` for the attempt
   — the first event is sequence 1 — raising `out_of_order_ai_task_event`
   otherwise, and inserts.
6. Renews the lease, since event traffic is itself proof of liveness.

### 6.7 `renew_ai_task_leases`

Takes a device and up to 32 `(task_id, attempt_id)` pairs (§8). It extends
`lease_expires_at` only where the attempt is unsettled, `device_id` matches,
`attempt_id` matches, **and `lease_expires_at > now()`**.

The expiry predicate is essential. Without it, a heartbeat arriving after
expiration but before the reaper's next pass would resurrect an attempt the
system has already judged dead — the renewal path would be the one place that
does not honour the unexpired-lease rule every other write enforces. Expiry must
be decided by the clock, not by which background job happens to run first.

Non-matching entries are ignored rather than raising, because a device
legitimately learns of fencing only from the response. The function returns the
set actually renewed, which the gateway relays so the connector can abort work on
tasks it no longer holds — the self-fencing signal §1.1 depends on.

### 6.8 Cancellation delivery

`cancel_ai_task` asserts `auth.uid() = initiating_user_id`, transitions the task
to `cancelled`, sets `cancelled_at`, and settles the current attempt with
`settle_operation = 'cancelled'` and `cancel_requested_at = now()`.

Delivery then runs off durable attempt state rather than socket state. The
sweeper sends `task.cancel` for attempts where `cancel_requested_at is not null`,
`cancel_acknowledged_at is null`, `cancel_requested_at > now() - interval
'24 hours'`, and the owning device is connected. The device replies
`task.cancelled`, which calls `acknowledge_task_cancellation` to stamp
`cancel_acknowledged_at`.

The frame carries the **settled** attempt's id, not a "current" one — cancelling
settles the attempt, so by the time the frame is sent there is no current attempt
to name. Without the acknowledgement column the sweeper could not tell a
cancellation still awaiting delivery from one delivered before a restart, and
would either drop it or resend it indefinitely; the 24-hour horizon bounds
delivery to a device that never returns.

### 6.9 Lease reaping

`reap_expired_ai_task_leases` finds unsettled attempts whose `lease_expires_at`
has passed and, per §1.1, splits them:

- **No events recorded** → task returns to `waiting_for_device`, attempt settled
  with that outcome, eligible for automatic re-announcement. Nothing observably
  ran.
- **Events recorded** → `needs_review` with `error_code = execution_abandoned`,
  preserving the partial stream. The user retries or discards.

It reads no device state.

### 6.10 Privilege model

The claim that PostgreSQL is the sole authority holds only if the gateway cannot
bypass the functions. `insert`, `update`, and `delete` on `ai_tasks`,
`ai_task_attempts`, `ai_task_events`, `execution_devices`, and
`provider_connections` are revoked from **both `authenticated` and
`service_role`**; every gateway write goes through an RPC in the §6 inventory,
which is why `record_device_connection` and `upsert_provider_connections` exist
rather than being inline updates. `select` remains available to `service_role`
and, under RLS, to `authenticated`, so the room UI can read task state in
Task 10 — reads create no alternate authority.

Following this schema's existing convention (`202607240001_core.sql:37`), every
function is declared `security definer` with `set search_path = ''` and
fully schema-qualified identifiers, and each is followed by
`revoke all on function ... from public` before an explicit grant to exactly one
role. `transition_ai_task` and `ai_task_lease_duration` are granted to no role at
all and are reachable only from other functions.

## 7. Protocol and Contract Changes

`packages/contracts` changes alongside the migration:

- `ai.ts` — `AIContextPackageSchema` gains `evidence` and `decisions` (§7.1).
- `ws.ts` — `task.payload` and `task.cancel` gain `attemptId`; `task.event`,
  `task.complete`, `task.fail`, and `task.cancelled` each gain `attemptId`;
  `heartbeat` gains `activeTasks: { taskId, attemptId }[]` (§3).
- `ws.ts` — three new server→device frames (§7.5).
- `ws.ts` — `task.event.event` becomes the bounded `TaskEventSchema` union
  (§7.2); `TaskErrorCodeSchema` gains `execution_abandoned` (§6.9); size caps per
  §8.

### 7.1 Context package gains evidence and decisions

`AIContextPackageSchema` (`ai.ts:58`) has no `evidence` or `decisions` fields, so
a manifest recording their IDs could not deliver them. Adding, with the same
bounded shape as `messages` and `attachments`:

- `evidence: { id, title, note }[]`
- `decisions: { id, summary, sourceMessageId }[]`

### 7.2 Events become a bounded union

`task.event` currently accepts `z.record(z.string(), z.unknown())` (`ws.ts:64`),
so "validates every frame with Zod" is not true of event content.
`TaskEventSchema` becomes a discriminated union with explicit caps:

- `{ type: "progress", label: string.max(200), percent?: 0–100 }`
- `{ type: "text.delta", text: string.max(10_000) }`
- `{ type: "notice", code: TaskErrorCode, message: string.max(2_000) }`

Unknown event types are rejected at the boundary, matching the governing design
§7 requirement that the connector reject unknown tool, file, or subprocess
events — the gateway applies the same rule in the other direction.

### 7.3 Per-kind result schemas are deferred

`AIResultEnvelope.payload` remains `z.unknown()` under the §8 size cap. Per-kind
schemas are deferred: `prd_generate` validates against `PRDDocumentSchema` only
once PRD tables exist (Task 11), and `room_reply` once the room renders results
(Task 10). Defining them now means writing validation no code path can exercise.

### 7.4 Error codes map to statuses

A single terminal `failed` would contradict the resumable states the governing
design §8 requires:

| `task_error_code` | Status |
| --- | --- |
| `authentication_required` | `needs_reauthentication` |
| `usage_limit_reached` | `usage_limit_reached` |
| `malformed_output`, `execution_abandoned` | `needs_review` |
| `cancelled` | `cancelled` |
| `permission_changed`, `security_boundary_violated`, `provider_unavailable`, `provider_install_failed`, `unknown` | `failed` |
| `connector_outdated` | `failed` — see below |

Each of these settles the attempt (§4.4), including the four that leave the task
non-terminal.

`connector_outdated` is an accepted gap. The governing design §8 says an
unsupported provider version should *pause* and offer a managed update, but
`ai_task_status` has no state for it. Inventing one now adds a status no code
path in this task can enter or leave. Task 8 owns provider version management.

### 7.5 Acknowledgement, rejection, and idempotent settlement

The server→device union carries no way to reject an operation or confirm a
settled one. Three frames are added:

- `task.claim_rejected { taskId, reason }`
- `task.operation_rejected { taskId, attemptId, operation, reason }` — carries
  `stale_ai_task_attempt`, `out_of_order_ai_task_event`,
  `conflicting_ai_task_event`, and `conflicting_ai_task_settlement`.
- `task.terminal_ack { taskId, attemptId, status }`

`settle_ai_task` is a single entry point for `complete`, `fail`, and `cancelled`,
and is idempotent against the attempt's settled state:

- Attempt current and valid → settle, record the fingerprint, return
  `task.terminal_ack`.
- Attempt already settled, **same** `settle_operation` and
  `settle_fingerprint` → re-emit `task.terminal_ack`. A connector whose
  settlement committed as the connection dropped learns its work was accepted,
  instead of being told it was fenced.
- Attempt already settled, **different** operation or fingerprint →
  `conflicting_ai_task_settlement`. A second completion bearing different content
  is a contradiction, not a retry, and silently acknowledging it would let a
  connector believe the server holds a result it does not.
- Attempt not found, or settled by a different device →
  `stale_ai_task_attempt`.

Because settlement is recorded for every exit from `running`, this holds equally
for outcomes that leave the task in `needs_review`, `needs_reauthentication`, or
`usage_limit_reached`.

## 8. Content Bounds

"Bounded room content" must hold end to end, not only on event frames. Database
and gateway limits are set consistently so a frame the gateway accepts cannot be
rejected by a constraint mid-stream.

| Boundary | Limit | Enforced at |
| --- | --- | --- |
| WebSocket frame | 1 MiB | `@fastify/websocket` `maxPayload` |
| Event payload | 64 KiB | Zod, `check` on `ai_task_events.payload_json` |
| Result payload | 256 KiB | Zod, `check` on `ai_tasks.result_json` |
| Instruction | 20 000 chars | Zod, `check` on `ai_tasks.instruction` |
| Manifest element counts | 500 messages, 50 attachments, 100 evidence, 100 decisions | `create_ai_task` |
| Manifest JSON | 256 KiB | `check` on `ai_tasks.context_manifest_json` |
| Hydrated context package | 512 KiB | `hydrate_authorized_room_context`, leaving frame headroom |
| `activeTasks` per heartbeat | 32 | Zod, `renew_ai_task_leases` |

A hydrated context exceeding its ceiling fails the task with `unknown` rather
than truncating, because silently dropping authorized content would change what
the provider reasons about without telling anyone.

## 9. Gateway

```
apps/gateway/src/
  main.ts                    entrypoint: listen, config validation, shutdown
  server.ts                  Fastify, /health, WebSocket upgrade route
  auth/device-token.ts       mint / hash / constant-time verify  (shared)
  auth/device-auth.ts        upgrade-time authentication
  tasks/task-repository.ts   service-role client, one wrapper per §6 function
  ws/device-session.ts       per-connection state, heartbeat, lease renewal
  ws/protocol-handler.ts     frame routing, Zod validation, sequencing
  dispatch/sweeper.ts        announce, deliver cancellations, reap
```

### 9.1 Making the package runnable

The package declares only `lint`, `test`, and `typecheck` (`package.json:6-10`),
sets `noEmit: true` (`tsconfig.json:7`), and nothing calls `listen()`.

`tsc` alone cannot fix this. `@meld/contracts` exports `./src/index.ts` directly
(`packages/contracts/package.json:7`) with `noEmit` and no build script, so
compiled output would import a TypeScript file Node 20 cannot load;
`moduleResolution: "Bundler"` additionally emits extensionless relative
specifiers Node's ESM resolver rejects. Bundling resolves both:

- `tsup` bundles `src/main.ts` to ESM in `dist/`, runtime dependencies external
  and `@meld/contracts` inlined via `noExternal`. Contracts keeps its
  TypeScript-only export, so web resolution is untouched.
- Scripts: `build: "tsup"`, `start: "node dist/main.js"`,
  `dev: "tsx watch src/main.ts"`, and `test:integration` (§11.4); `test` excludes
  `*.integration.test.ts` so it stays database-free.
- `tsconfig.json` keeps `noEmit: true`; checking and emission are separate.
- Dependencies pinned exactly: `@fastify/websocket`, `@supabase/supabase-js`,
  `@meld/contracts`, `zod`; `tsx` and `tsup` as devDependencies.

Because `pnpm build` runs `turbo build`, CI exercises the bundle every run.

`scripts/seed-device.ts` and `scripts/fake-connector.ts` are TypeScript run via
`pnpm exec tsx`. Plain Node cannot import `auth/device-token.ts`, and duplicating
the credential format in a `.mjs` file would defeat the single implementation
Task 7's pairing flow is meant to reuse.

`scripts/check-test-colocation.mjs` currently runs against `apps/web` only; CI
extends it to `apps/gateway`.

### 9.2 Configuration

`GATEWAY_PORT`, `GATEWAY_SUPABASE_URL`, `GATEWAY_SUPABASE_SERVICE_ROLE_KEY`,
`GATEWAY_POLL_INTERVAL_MS` (default 3000), `GATEWAY_HEARTBEAT_SECONDS`
(default 30). Added to `.env.example`. Lease duration is deliberately absent — it
belongs to the database (§3).

At startup `main.ts` reads `ai_task_lease_duration()` and **refuses to start if
`GATEWAY_HEARTBEAT_SECONDS` exceeds one third of it**. A cadence at or above the
lease makes routine expiry a certainty: every task would be reaped mid-run and,
under §6.9, land in `needs_review` for the user to adjudicate. Deriving the
ceiling from the database value rather than hardcoding 30 keeps the two from
drifting if the lease is ever retuned.

### 9.3 Device authentication

The upgrade requires `Authorization: Device <deviceId>.<secret>`. The gateway
hashes the presented secret, fetches the device via
`get_execution_device_for_auth`, and compares with `timingSafeEqual`. When no
device row exists it compares against a fixed dummy digest, so response timing
does not disclose device existence. A missing, malformed, mismatched, or revoked
credential returns `401` and no socket is established. Success calls
`record_device_connection` and emits `session.accepted { heartbeatSeconds }`.

`auth/device-token.ts` owns secret generation (32 random bytes, base64url) and
hashing; the seed script and Task 7's pairing flow both call it.

### 9.4 Dispatch is announce-by-state, not announce-on-transition

Each sweep calls `list_dispatchable_ai_tasks` for connected devices, then:

1. Promotes `queued` and `waiting_for_device` tasks to `ready_to_run`.
2. Demotes `queued` tasks for absent devices to `waiting_for_device`.
3. **Announces `task.available` for every `ready_to_run` task**, regardless of
   whether this sweep transitioned it.
4. Delivers pending `task.cancel` frames (§6.8).
5. Reaps expired leases (§6.9).

Step 3 is stated separately because transitioning and announcing cannot be made
atomic across a database and a socket. A gateway that crashed between committing
`queued → ready_to_run` and writing the frame would otherwise strand the task: it
is neither `queued` nor `waiting_for_device`, so no later sweep or reconnect
would revisit it. Announcing from current state makes the frame a repeatable
statement of fact rather than a one-shot notification, which is also why
re-announcement is harmless — `task.available` carries no state, and a device
already working the task ignores it.

Device connection runs the same logic scoped to that device.

"Currently connected" is read from the sweeper's in-process socket set, which
assumes a **single gateway instance**. This is acceptable now — the gateway is
not deployed (§13) — and no correctness property depends on it, because claiming
is safe under `SKIP LOCKED` and every write is attempt-validated regardless of
instance count. The failure mode is a delayed task, never a duplicated or
misrouted one.

### 9.5 Frame flow

`task.claim` → `claim_ai_task` → `hydrate_authorized_room_context` → one
`task.payload` carrying `attemptId`, or `task.claim_rejected`.

`task.event` → `append_ai_task_event` → `task.event_ack` or
`task.operation_rejected`. `task.complete`, `task.fail`, and `task.cancelled` →
`settle_ai_task` → `task.terminal_ack` or `task.operation_rejected`.

`heartbeat` → `renew_ai_task_leases` → the renewed set, so the connector can
abort tasks it no longer holds. `provider.status` →
`upsert_provider_connections`.

## 10. Error Handling

| Condition | Response |
| --- | --- |
| Bad, revoked, or malformed credential | `401` at upgrade; no socket |
| `GATEWAY_HEARTBEAT_SECONDS` above one third of the lease | Startup refused (§9.2) |
| Frame fails Zod validation, or exceeds `maxPayload` | Close `1008` |
| Exact event replay | `task.event_ack` with the stored sequence |
| Same sequence, differing type or payload | `conflicting_ai_task_event`; close `1008` |
| Out-of-order sequence | `out_of_order_ai_task_event`; close `1008` |
| Write from a settled or expired attempt | `stale_ai_task_attempt`; socket left open — losing a lease is a race a correct connector cannot always avoid |
| Settlement retry, same operation and fingerprint | `task.terminal_ack` (§7.5) |
| Settlement retry, different operation or fingerprint | `conflicting_ai_task_settlement` |
| Heartbeat for an already-expired lease | Not renewed (§6.7); attempt reaped |
| Claim lost to another connection | `task.claim_rejected`; no context emitted |
| Access revoked between create and claim | `failed` / `permission_changed`; no context |
| Lease expires with no events | `waiting_for_device`; re-announced automatically |
| Lease expires with events | `needs_review` / `execution_abandoned` (§1.1) |
| Missed heartbeats | Socket closed; tasks recovered by lease expiry, not socket state |
| Cancellation undelivered across restart | Redelivered from `cancel_requested_at` (§6.8) |

## 11. Testing

### 11.1 pgTAP — `supabase/tests/ai_task_transitions.test.sql`

Transitions legal and illegal, including the two cases named in the MVP plan;
cancel-then-complete rejected; event ordering (gap, out-of-order, exact replay,
conflicting payload); events rejected for non-`running` tasks; stale-attempt
rejection; **settlement recorded and replayable for each non-terminal outcome**
(`needs_review`, `needs_reauthentication`, `usage_limit_reached`) as well as
terminal ones; settlement retry with a differing fingerprint rejected; renewal
refused for an already-expired lease; both reaping branches; error-code mapping;
`resolve_ai_task`; `create_ai_task` rejecting another user's device, a revoked
device, a non-participant room, an unconnected provider, and each §8 bound;
hydration returning nothing once access is revoked; the partial unique index
refusing a second current attempt; and `authenticated` and `service_role` both
denied direct DML (§6.10).

### 11.2 Integration — `apps/gateway/src/**/*.integration.test.ts`

pgTAP executes in a single session inside one transaction, so it **cannot**
exercise `SKIP LOCKED` contention or lease expiry across concurrent
transactions. These run in vitest against a local Supabase stack and a live
gateway, using two independent service-role connections where contention is the
subject:

- two devices race one task; one claim succeeds, the loser receives
  `task.claim_rejected`, one context is emitted;
- gateway restarts after a claim; the task is recovered and completes;
- **gateway killed after `queued → ready_to_run` commits but before
  `task.available` is written**; the next sweep re-announces it (§9.4);
- connector restarts mid-run; the resumed attempt is rejected as stale and the
  requeued task completes under a new attempt;
- **heartbeat arriving immediately after lease expiry but before the reaper
  runs** does not renew, and the attempt is subsequently reaped (§6.7);
- a lease expires with the socket open; the superseded attempt's settlement is
  rejected and does not overwrite the new attempt's result;
- settlement commits as the connection drops; the retry returns
  `task.terminal_ack`, for a terminal outcome *and* for `needs_review`;
- lease expiry with zero events requeues; with events, lands in `needs_review`;
- cancellation issued while the gateway is stopped is delivered after restart and
  not redelivered once acknowledged (§6.8);
- an event stream with a deliberate gap and a deliberate replay.

### 11.3 Unit

Gateway vitest, colocated: `device-token` round-trip, `device-auth` rejection
paths and unknown-device timing, `protocol-handler` per-frame validation and
close conditions, startup config validation (§9.2). Web vitest: `task-service`
manifest construction, asserting identifiers only, no storage paths or bodies.

### 11.4 CI wiring

Neither existing job can run §11.2: `validate` installs Node dependencies but
starts no database, and `database` runs `supabase db start` — Postgres only, per
its own comment at `ci.yml:44` — with no Node toolchain, while `supabase-js`
needs PostgREST.

A new `gateway-integration` job:

1. `actions/checkout`, `pnpm/action-setup`, `actions/setup-node` (20.19.0),
   `supabase/setup-cli` (2.109.1) — versions the other jobs already pin.
2. `pnpm install --frozen-lockfile`.
3. `supabase start` — the full stack, not `db start`.
4. Poll `supabase status` until the API is ready, so a slow container surfaces as
   a timeout rather than a flake.
5. `pnpm --filter @meld/gateway test:integration`, with `GATEWAY_SUPABASE_URL`
   and `GATEWAY_SUPABASE_SERVICE_ROLE_KEY` from `supabase status -o env`.
6. `supabase stop --no-backup` in an `always()` step.

Without this job the suite would pass locally and never execute on a pull
request.

### 11.5 Manual

`scripts/fake-connector.ts` drives a full task from the command line and accepts
flags to induce the §11.2 failure modes by hand. Task 6 ships no UI and so has no
Playwright coverage; this script is the vehicle for observing real behaviour, and
doubles as the reference implementation Task 7's macOS connector is written
against.

## 12. Interface Obligations on Later Tasks

- **Task 7** — connector self-fencing: abort the provider child process group
  when a lease cannot be renewed, and treat absence from the
  `renew_ai_task_leases` response as fencing (§1.1, §6.7).
- **Task 10** — render exactly one attempt's event stream, per §1.1; never merge
  a superseded attempt's deltas with a retry's.

## 13. Out of Scope

- **Per-kind result payload schemas** — Tasks 10 and 11 (§7.3).
- **A paused state for `connector_outdated`** — Task 8 (§7.4).
- **Default provider per user** (`ai_connections`) — Settings → AI connections.
  Task 6 takes `provider` as an explicit input.
- **PRD version in the manifest** — Task 11. No nullable placeholder is added: a
  field that is always null cannot be tested and is indistinguishable from a
  defect until it acquires meaning.
- **Web API routes for `resolve_ai_task`** — Task 10 (§6.2).
- **Pairing and the macOS connector** — Task 7.
- **Codex and Claude adapters, provider execution** — Task 8.
- **Room UI for task status and streamed events** — Task 10.
- **Multi-instance gateway deployment** — requires replacing in-process socket
  tracking with a shared liveness signal (§9.4).
