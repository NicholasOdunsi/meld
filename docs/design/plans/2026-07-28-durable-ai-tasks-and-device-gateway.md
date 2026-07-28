# Durable AI Tasks and Device Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Task 6's durable, room-authorized AI task queue and a runnable WebSocket gateway that safely routes work to the initiating user's paired device.

**Architecture:** The authenticated web app freezes an identifier-only context manifest and creates tasks through a security-definer RPC. PostgreSQL is the sole state-machine authority: it owns dispatch state, attempt leases, event ordering, settlement replay, cancellation delivery, and execution-time authorization. The Fastify gateway authenticates device sockets, validates bounded shared contracts, forwards operations to RPCs, and repeatedly announces database state; it never performs direct task DML.

**Tech Stack:** PostgreSQL 17, Supabase CLI 2.109.1, pgTAP, Next.js 16, TypeScript 5.9, Zod 4.4, Fastify 5.10, `@fastify/websocket` 11.3, `@supabase/supabase-js` 2.109, `ws` 8.21, Vitest 4.1, tsup 8.5, tsx 4.23, Postgres.js 3.4, pnpm 10.28, Node 20.19.

## Global Constraints

- The governing design is `docs/design/specs/2026-07-28-durable-ai-tasks-and-device-gateway-design.md`; the provider model in `docs/design/specs/2026-07-25-provider-connection-model-design.md` wins if older MVP wording conflicts.
- Exactly one current attempt may persist writes at a time; historical attempts and their events remain as an audit trail.
- Provider execution itself is not exactly-once. Only the current unexpired attempt may persist an event or settlement.
- Lease duration is the immutable database value `interval '90 seconds'`; no gateway lease-duration environment variable exists.
- Heartbeats default to 30 seconds and startup rejects a cadence above one third of the database lease.
- WebSocket frames are at most 1 MiB; event JSON 64 KiB; result JSON 256 KiB; manifest JSON 256 KiB; hydrated context 512 KiB; instruction 20,000 characters; heartbeat `activeTasks` 32.
- Manifest counts are at most 500 messages, 50 attachments, 100 evidence records, and 100 decisions.
- The web process uses only the authenticated Supabase session. The service-role key exists only in `apps/gateway`.
- Revoke direct `insert`, `update`, and `delete` on gateway-owned tables from both `authenticated` and `service_role`; every mutation uses an RPC.
- Every security-definer function uses `set search_path = ''`, schema-qualified names, `REVOKE ALL ... FROM PUBLIC`, and one explicit caller grant.
- Never persist or transmit plaintext device secrets, storage paths, signed URLs, provider credential paths, executable paths, environment values, or raw provider responses.
- Gateway production code has one database path: `@supabase/supabase-js`. Postgres.js is dev-only for owner-level fixtures and device seeding.
- The gateway is single-instance for Task 6. In-process socket presence may delay dispatch under multiple instances, but database claiming and attempt fencing remain authoritative.
- No pairing UI, macOS connector, provider adapter execution, streamed room UI, PRD table, `ai_connections`, or per-kind result schema is added in this task.
- Follow TDD within each task and make the listed commit before starting the next task.

---

### Task 1: Bound and complete the shared AI/WebSocket contracts

**Files:**
- Modify: `packages/contracts/src/ai.ts`
- Modify: `packages/contracts/src/ws.ts`
- Modify: `packages/contracts/src/contracts.test.ts`

**Interfaces:**
- Consumes: existing `ProviderSchema`, `AITaskKindSchema`, and `AITaskStatusSchema`.
- Produces:
  - `MAX_*` protocol constants exported from `@meld/contracts`.
  - `AIContextManifestSchema`, `AIContextPackageSchema`, `TaskEventSchema`, and `ActiveTaskLeaseSchema`.
  - Complete `ServerToDeviceMessageSchema` and `DeviceToServerMessageSchema`, including attempt IDs, renewal acknowledgement, rejection frames, and terminal acknowledgement.

- [ ] **Step 1: Write failing context-boundary tests**

Add tests that prove evidence and decisions are present, array ceilings reject one extra item, `currentPrd` is absent, and serialized hydrated context above 512 KiB is rejected:

```ts
const uuid = () => crypto.randomUUID();

it("parses bounded evidence and decisions without PRD placeholders", () => {
  const context = AIContextPackageSchema.parse({
    taskId: uuid(),
    initiatingUserId: uuid(),
    organizationId: uuid(),
    roomId: uuid(),
    kind: "room_reply",
    instruction: "Summarize the room",
    messages: [],
    attachments: [],
    evidence: [{ id: uuid(), title: "Interview", note: "Observed friction" }],
    decisions: [{ id: uuid(), summary: "Ship the fix", sourceMessageId: null }],
  });
  expect(context).not.toHaveProperty("currentPrd");
});

it("rejects a manifest with 501 messages", () => {
  expect(
    AIContextManifestSchema.safeParse({
      messageIds: Array.from({ length: 501 }, uuid),
      attachmentIds: [],
      evidenceIds: [],
      decisionIds: [],
    }).success,
  ).toBe(false);
});
```

- [ ] **Step 2: Write failing protocol tests**

Test all new frames and all forbidden omissions:

```ts
it("requires attempt identity on every attempt-scoped frame", () => {
  const taskId = uuid();
  const result = DeviceToServerMessageSchema.safeParse({
    type: "task.event",
    taskId,
    sequence: 1,
    event: { type: "progress", label: "Starting" },
  });
  expect(result.success).toBe(false);
});

it("returns the exact leases renewed by a heartbeat", () => {
  const lease = { taskId: uuid(), attemptId: uuid() };
  expect(
    ServerToDeviceMessageSchema.parse({
      type: "heartbeat.ack",
      renewedTasks: [lease],
    }),
  ).toEqual({ type: "heartbeat.ack", renewedTasks: [lease] });
});

it("rejects unbounded and unknown task events", () => {
  expect(
    TaskEventSchema.safeParse({ type: "text.delta", text: "x".repeat(10_001) })
      .success,
  ).toBe(false);
  expect(
    TaskEventSchema.safeParse({ type: "tool.call", command: "cat ~/.ssh/id_rsa" })
      .success,
  ).toBe(false);
});
```

- [ ] **Step 3: Run the contracts suite and verify failure**

Run:

```bash
pnpm --filter @meld/contracts test -- src/contracts.test.ts
```

Expected: FAIL because the manifest, bounded event union, attempt fields, and acknowledgement frames do not exist.

- [ ] **Step 4: Implement exact size and count helpers**

In `ai.ts`, export these constants and schemas:

```ts
export const MAX_INSTRUCTION_CHARS = 20_000;
export const MAX_MANIFEST_MESSAGES = 500;
export const MAX_MANIFEST_ATTACHMENTS = 50;
export const MAX_MANIFEST_EVIDENCE = 100;
export const MAX_MANIFEST_DECISIONS = 100;
export const MAX_HYDRATED_CONTEXT_BYTES = 512 * 1024;
export const MAX_RESULT_BYTES = 256 * 1024;

const jsonBytes = (value: unknown) => {
  const serialized = JSON.stringify(value);
  return serialized === undefined
    ? Number.POSITIVE_INFINITY
    : new TextEncoder().encode(serialized).byteLength;
};

export const AIContextManifestSchema = z.object({
  messageIds: z.array(z.string().uuid()).max(MAX_MANIFEST_MESSAGES),
  attachmentIds: z.array(z.string().uuid()).max(MAX_MANIFEST_ATTACHMENTS),
  evidenceIds: z.array(z.string().uuid()).max(MAX_MANIFEST_EVIDENCE),
  decisionIds: z.array(z.string().uuid()).max(MAX_MANIFEST_DECISIONS),
});

export const EvidenceContextSchema = z.object({
  id: z.string().uuid(),
  title: z.string().max(200),
  note: z.string().max(10_000).nullable(),
});

export const DecisionContextSchema = z.object({
  id: z.string().uuid(),
  summary: z.string().max(5_000),
  sourceMessageId: z.string().uuid().nullable(),
});
```

Change `AIContextPackageSchema` to use `.max(...)` on each array, add `evidence` and `decisions`, remove `currentPrd`, cap `instruction`, and add a `.refine(jsonBytes <= MAX_HYDRATED_CONTEXT_BYTES)` check. Add the same serialized-size refinement to `AIResultEnvelopeSchema`.

- [ ] **Step 5: Implement the complete protocol unions**

In `ws.ts`, define:

```ts
export const MAX_ACTIVE_TASKS = 32;
export const TaskOperationSchema = z.enum([
  "event",
  "complete",
  "fail",
  "cancelled",
]);
export const TaskOperationRejectionSchema = z.enum([
  "stale_ai_task_attempt",
  "out_of_order_ai_task_event",
  "conflicting_ai_task_event",
  "conflicting_ai_task_settlement",
]);
export const TaskClaimRejectionSchema = z.enum([
  "claim_lost",
  "permission_changed",
  "context_too_large",
]);
export const ActiveTaskLeaseSchema = z.object({
  taskId: z.string().uuid(),
  attemptId: z.string().uuid(),
});
export const TaskEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("progress"),
    label: z.string().min(1).max(200),
    percent: z.number().min(0).max(100).optional(),
  }),
  z.object({ type: z.literal("text.delta"), text: z.string().max(10_000) }),
  z.object({
    type: z.literal("notice"),
    code: TaskErrorCodeSchema,
    message: z.string().max(2_000),
  }),
]);
```

Add `execution_abandoned` to `TaskErrorCodeSchema`. Define server frames for `session.accepted`, `heartbeat.ack`, `task.available`, `task.payload`, `task.cancel`, `task.event_ack`, `task.claim_rejected`, `task.operation_rejected`, and `task.terminal_ack`. `task.claim_rejected.reason` uses `TaskClaimRejectionSchema`; `task.operation_rejected.reason` uses `TaskOperationRejectionSchema`. Define device frames for `heartbeat`, `provider.status`, `task.claim`, `task.event`, `task.complete`, `task.fail`, and `task.cancelled`. Every attempt-scoped frame and event acknowledgement carries `attemptId`; heartbeat carries `activeTasks: ActiveTaskLeaseSchema.array().max(32)`.

- [ ] **Step 6: Run contract, type, and lint checks**

Run:

```bash
pnpm --filter @meld/contracts test
pnpm --filter @meld/contracts typecheck
pnpm --filter @meld/contracts lint
```

Expected: PASS.

- [ ] **Step 7: Commit shared contracts**

```bash
git add packages/contracts/src/ai.ts packages/contracts/src/ws.ts packages/contracts/src/contracts.test.ts
git commit -m "feat: bound AI task gateway contracts"
```

---

### Task 2: Add the task schema, ownership constraints, creation, cancellation, and resolution

**Files:**
- Create: `supabase/migrations/202607280001_ai_tasks.sql`
- Create: `supabase/tests/ai_task_transitions.test.sql`

**Interfaces:**
- Consumes: the enum values and content bounds from Task 1.
- Produces:
  - Tables `execution_devices`, `provider_connections`, `ai_tasks`, `ai_task_attempts`, and `ai_task_events`.
  - Internal `ai_task_lease_duration()` and `transition_ai_task(...)`.
  - Authenticated RPCs `create_ai_task(...)`, `cancel_ai_task(uuid)`, and `resolve_ai_task(uuid, text)`.
  - RLS read policies and structural cross-user/cross-organization constraints.

- [ ] **Step 1: Create pgTAP fixtures and failing ownership tests**

Start one transaction, install pgTAP, plan the exact assertion count, insert two users, one organization, memberships, one room with messages/attachments/evidence/decisions, and devices for both users. Switch JWT identity with:

```sql
set local role authenticated;
select set_config('request.jwt.claim.sub', test_owner_id::text, true);
```

Assert that `create_ai_task` lives for the caller's active device/provider and throws `P0001` for another user's device, a revoked device, a missing provider connection, a non-participant room, an organization mismatch that cannot be inserted, an overlong instruction, and every manifest count/byte ceiling.

- [ ] **Step 2: Add failing transition, cancellation, and resolution tests**

Use exact checks:

```sql
select lives_ok(
  $$ select public.transition_ai_task(
    '70000000-0000-4000-8000-000000000001',
    'waiting_for_device',
    'queued'
  ) $$,
  'queued task can wait for its device'
);

select throws_ok(
  $$ select public.transition_ai_task(
    '70000000-0000-4000-8000-000000000001',
    'completed',
    'waiting_for_device'
  ) $$,
  'P0001',
  'invalid_ai_task_transition',
  'task cannot skip execution'
);
```

Assert only `initiating_user_id` may cancel or resolve; `retry`, `accept`, and `discard` work only from the states in §6.2; terminal tasks reject all transitions.

- [ ] **Step 3: Run the database test and verify failure**

Run:

```bash
supabase db reset
supabase test db supabase/tests/ai_task_transitions.test.sql
```

Expected: FAIL because the migration and functions do not exist.

- [ ] **Step 4: Create enums and tables with structural constraints**

Create PostgreSQL enums matching contracts exactly:

```sql
create extension if not exists pgcrypto with schema extensions;

create type public.ai_provider as enum ('codex', 'claude');
create type public.ai_task_kind as enum (
  'room_reply', 'prd_generate', 'prd_revise', 'stage_readiness'
);
create type public.ai_task_status as enum (
  'queued', 'waiting_for_device', 'ready_to_run', 'running',
  'needs_reauthentication', 'usage_limit_reached', 'needs_review',
  'completed', 'cancelled', 'failed'
);
create type public.ai_task_settle_operation as enum (
  'complete', 'fail', 'cancelled'
);
```

Add provider installation/authentication/compatibility enums and task error codes matching Task 1. Build all five tables exactly as §4 specifies. Include:

```sql
alter table public.discovery_rooms
  add constraint discovery_rooms_id_organization_id_key
  unique (id, organization_id);

create unique index ai_task_attempts_one_current
  on public.ai_task_attempts (task_id)
  where settled_at is null;

alter table public.ai_tasks
  add constraint ai_tasks_instruction_length
    check (char_length(instruction) between 1 and 20000),
  add constraint ai_tasks_manifest_size
    check (pg_column_size(context_manifest_json) <= 262144),
  add constraint ai_tasks_result_size
    check (result_json is null or pg_column_size(result_json) <= 262144);

alter table public.ai_task_events
  add constraint ai_task_events_payload_size
    check (pg_column_size(payload_json) <= 65536);
```

Use composite FKs `(device_id, initiating_user_id)`, `(room_id, organization_id)`, `(device_id, user_id)`, `(task_id, device_id)`, and `(attempt_id, task_id)` from the design.

- [ ] **Step 5: Implement the internal transition map**

Create `ai_task_lease_duration()` as immutable SQL returning `interval '90 seconds'`. Implement `transition_ai_task(p_task_id, p_to, p_from)` as a row-locking compare-and-swap. Encode the full table in §5 plus transitions from every non-terminal state to `cancelled` or `failed`. Raise only:

```sql
raise exception 'invalid_ai_task_transition' using errcode = 'P0001';
```

Do not grant either internal function to an API role.

- [ ] **Step 6: Implement authenticated creation**

Use this stable signature:

```sql
public.create_ai_task(
  target_room_id uuid,
  target_device_id uuid,
  target_provider public.ai_provider,
  target_kind public.ai_task_kind,
  target_instruction text,
  target_manifest jsonb
) returns jsonb
```

Inside one transaction derive `auth.uid()` and the room organization, require `public.is_room_participant(target_room_id)`, require an active owned device and matching provider connection, validate the manifest has exactly four ID arrays with the §8 count limits, reject duplicate IDs, and prove every referenced row belongs to the target room and is visible to the caller. Insert status `queued`, context revision `0`, and return camel-case-compatible JSON containing the task columns.

- [ ] **Step 7: Implement authenticated cancellation and resolution**

`cancel_ai_task` row-locks the task, checks ownership, transitions non-terminal status to `cancelled`, stamps `cancelled_at`, and when currently running settles its attempt with operation `cancelled`, a canonical SHA-256 fingerprint, `cancel_requested_at`, and outcome `cancelled`.

`resolve_ai_task` accepts only:

```sql
case
  when target_action = 'retry'
    and current_status in ('needs_reauthentication', 'usage_limit_reached', 'needs_review')
    then 'ready_to_run'
  when target_action = 'accept' and current_status = 'needs_review'
    then 'completed'
  when target_action = 'discard' and current_status = 'needs_review'
    then 'cancelled'
  else raise exception 'invalid_ai_task_resolution' using errcode = 'P0001';
end case;
```

- [ ] **Step 8: Add RLS reads and lock down writes**

Enable RLS on all five tables. Permit users to read their own devices/provider connections and permit room participants to read task/attempt/event rows through the task's room. Do not add direct write policies. Revoke DML from `authenticated` and `service_role`; grant only the authenticated RPCs:

```sql
revoke all on function public.create_ai_task(
  uuid, uuid, public.ai_provider, public.ai_task_kind, text, jsonb
) from public;
grant execute on function public.create_ai_task(
  uuid, uuid, public.ai_provider, public.ai_task_kind, text, jsonb
) to authenticated;
```

Repeat the explicit revoke/grant for cancel and resolve.

- [ ] **Step 9: Run pgTAP and commit**

Run:

```bash
supabase db reset
supabase test db supabase/tests/ai_task_transitions.test.sql
```

Expected: PASS for the schema, ownership, creation, transition, cancel, and resolution assertions.

```bash
git add supabase/migrations/202607280001_ai_tasks.sql supabase/tests/ai_task_transitions.test.sql
git commit -m "feat: add authorized durable AI task schema"
```

---

### Task 3: Implement attempts, ordered events, lease renewal, settlement replay, and reaping

**Files:**
- Modify: `supabase/migrations/202607280001_ai_tasks.sql`
- Modify: `supabase/tests/ai_task_transitions.test.sql`

**Interfaces:**
- Consumes: Task 2 tables and internal transition function.
- Produces:
  - `claim_ai_task(uuid, uuid)`
  - `append_ai_task_event(uuid, uuid, uuid, bigint, text, jsonb)`
  - `renew_ai_task_leases(uuid, jsonb)`
  - `settle_ai_task(uuid, uuid, uuid, ai_task_settle_operation, task_error_code, text, jsonb, boolean)`
  - `acknowledge_task_cancellation(uuid, uuid, uuid)`
  - `reap_expired_ai_task_leases()`

- [ ] **Step 1: Add failing claim and one-current-attempt tests**

Assert `ready_to_run → running` inserts attempt 1 with a future lease, a second current attempt violates the partial unique index, the wrong device cannot claim, and only one of two claims can obtain a payload candidate.

- [ ] **Step 2: Add failing event-order and replay tests**

Assert sequence starts at 1, sequence 7 before 1 raises `out_of_order_ai_task_event`, exact replay returns 1 without inserting, same sequence with a different type or payload raises `conflicting_ai_task_event`, and events fail after cancellation, settlement, expiration, or from another device. Replay comparison must check both `type` and `payload_json`.

- [ ] **Step 3: Add failing lease, settlement, and reaper tests**

Assert renewal returns only unexpired matching attempts, renewal one microsecond after expiry returns no row before reaping, no-event expiry settles to `waiting_for_device`, eventful expiry settles to `needs_review/execution_abandoned`, and stale attempts cannot complete.

For each of `completed`, `needs_review`, `needs_reauthentication`, and `usage_limit_reached`, assert identical settlement replay returns the recorded status and a different operation or canonical content raises `conflicting_ai_task_settlement`.

- [ ] **Step 4: Run pgTAP and verify the new assertions fail**

```bash
supabase db reset
supabase test db supabase/tests/ai_task_transitions.test.sql
```

Expected: FAIL because execution RPCs do not exist.

- [ ] **Step 5: Implement atomic claiming**

`claim_ai_task` must:

```sql
select task.*
into claimed_task
from public.ai_tasks as task
where task.id = target_task_id
  and task.device_id = target_device_id
  and task.status = 'ready_to_run'
for update skip locked;
```

Raise `ai_task_claim_rejected` if no row is acquired. Transition to `running`; set `attempt_no` to the prior maximum plus one; insert a UUID attempt with `lease_expires_at = now() + public.ai_task_lease_duration()`; return task, attempt, provider, kind, and instruction identifiers without returning context.

- [ ] **Step 6: Implement lookup-before-order event append**

Lock the task and current attempt. Reject a settled, mismatched, expired, or non-running attempt as `stale_ai_task_attempt`. Look up `(attempt_id, sequence)` first:

```sql
if stored_event is not null then
  if stored_event.type = target_type
    and stored_event.payload_json = target_payload
  then
    return target_sequence;
  end if;
  raise exception 'conflicting_ai_task_event' using errcode = 'P0001';
end if;
```

Only for a new sequence, require `coalesce(max(sequence), 0) + 1`, insert, and renew the lease. Reject a gap as `out_of_order_ai_task_event`.

- [ ] **Step 7: Implement renewal with expiry fencing**

Accept a JSON array of at most 32 `{taskId, attemptId}` records, join it to attempts/tasks owned by the presented device, and update only:

```sql
where attempt.settled_at is null
  and attempt.device_id = target_device_id
  and attempt.lease_expires_at > now()
```

Return only renewed `(task_id, attempt_id)` pairs. Never raise for absent/stale pairs; their omission is the connector's fencing signal.

- [ ] **Step 8: Implement canonical settlement replay**

Canonicalize the operation, code, message, result, and partial flag with `jsonb_build_object`, then hash `convert_to(canonical_json::text, 'utf8')` with `digest(..., 'sha256')`. For a current valid attempt, map error code to status exactly as §7.4, write task result/error fields, and settle the attempt in the same transaction. For an already-settled attempt, return its outcome only when both operation and fingerprint match; otherwise raise `conflicting_ai_task_settlement`.

- [ ] **Step 9: Implement cancellation acknowledgement and lease reaping**

`acknowledge_task_cancellation` validates the settled attempt, device, `settle_operation = 'cancelled'`, and non-null `cancel_requested_at`, then idempotently stamps `cancel_acknowledged_at`.

`reap_expired_ai_task_leases` locks expired unsettled attempts with `skip locked`. Count events for each attempt. Zero events settles to `waiting_for_device`; one or more settles to `needs_review` with `execution_abandoned`. Return task/attempt/outcome rows for observability.

- [ ] **Step 10: Run pgTAP and commit**

```bash
supabase db reset
supabase test db supabase/tests/ai_task_transitions.test.sql
git add supabase/migrations/202607280001_ai_tasks.sql supabase/tests/ai_task_transitions.test.sql
git commit -m "feat: fence AI task execution attempts"
```

Expected: all claim, event, renewal, settlement, cancellation, and reaper assertions PASS.

---

### Task 4: Add execution-time hydration, device/provider RPCs, dispatch refresh, and privilege proofs

**Files:**
- Modify: `supabase/migrations/202607280001_ai_tasks.sql`
- Modify: `supabase/tests/ai_task_transitions.test.sql`

**Interfaces:**
- Consumes: Task 3 current-attempt validation and Task 2 manifest shape.
- Produces:
  - `hydrate_authorized_room_context(uuid, uuid)`
  - `get_ai_task_lease_seconds()`
  - `get_execution_device_for_auth(uuid)`
  - `record_device_connection(uuid, text)`
  - `upsert_provider_connections(uuid, jsonb)`
  - `list_dispatchable_ai_tasks(uuid[])`
  - Service-role-only function grants with no direct write escape hatch.

- [ ] **Step 1: Add failing hydration security tests**

Create a task manifest naming one message, ready text attachment, captioned image, evidence row, and decision row. Claim it and assert hydration returns exactly those records with no `storage_path`. Then remove the initiating user's room participation and assert hydration returns no package, settles the task to `failed`, and records `permission_changed`.

Add a 512 KiB hydrated package fixture and assert the function fails the task with `unknown` rather than truncating.

- [ ] **Step 2: Add failing device/provider/dispatch tests**

Assert device auth lookup returns only `id`, `user_id`, `token_hash`, and status; connection recording changes only version/last-seen; provider upsert cannot store paths or raw response fields; queued tasks for connected devices become ready; queued tasks for absent devices become waiting; waiting tasks reconnect to ready; existing ready tasks are returned every sweep; pending cancellations are returned until acknowledged and stop after acknowledgement or 24 hours.

- [ ] **Step 3: Add failing privilege tests**

Under `authenticated` and then `service_role`, assert direct insert/update/delete on all five tables throws `42501`. Assert `PUBLIC` cannot execute any RPC and each RPC works only for its named role.

- [ ] **Step 4: Run pgTAP and verify failure**

```bash
supabase db reset
supabase test db supabase/tests/ai_task_transitions.test.sql
```

Expected: FAIL because hydration and gateway-facing RPCs do not exist.

- [ ] **Step 5: Implement security-critical hydration**

Lock and validate the named current attempt, then independently prove:

```sql
exists (
  select 1
  from public.room_participants participant
  join public.memberships membership
    on membership.user_id = participant.user_id
  join public.discovery_rooms room
    on room.id = participant.room_id
   and room.organization_id = membership.organization_id
  where participant.room_id = task.room_id
    and participant.user_id = task.initiating_user_id
)
```

Join only manifest-listed rows that still belong to the room. Emit messages with author display fallback, attachments with `original_name`, `mime_type`, ready `extracted_text`, and caption, evidence with title/note, and decisions with summary/source message. Do not select `storage_path`. Build camel-case JSON, measure `pg_column_size`, and settle failure before returning any JSON when access or size checks fail.

- [ ] **Step 6: Implement device and provider functions**

`get_ai_task_lease_seconds` returns
`extract(epoch from public.ai_task_lease_duration())::integer`, is read-only,
and is granted only to `service_role`. `get_execution_device_for_auth` returns
one row and never mutates. `record_device_connection` requires an active
non-revoked device and updates only `last_seen_at` and a connector version
capped at 100 characters.

`upsert_provider_connections` accepts at most two provider records, validates all enum strings before any write, derives `user_id` from the device, and upserts only:

```sql
provider, installation, version, authentication, compatibility, last_seen_at
```

Unknown JSON keys are ignored because no target column exists.

- [ ] **Step 7: Implement dispatch state refresh inside its RPC**

`list_dispatchable_ai_tasks(connected_device_ids uuid[])` treats null as an empty array, deduplicates IDs, locks `queued`, `waiting_for_device`, and `ready_to_run` rows, and performs:

```sql
queued + connected       -> ready_to_run
queued + absent          -> waiting_for_device
waiting_for_device + connected -> ready_to_run
ready_to_run + absent    -> waiting_for_device
```

Return a discriminated row shape:

```text
kind = 'available': task_id, device_id, status, attempt_id null
kind = 'cancel':    task_id, device_id, status cancelled, settled attempt_id
```

Only return ready tasks for connected devices and cancellations inside the 24-hour delivery horizon.

- [ ] **Step 8: Apply final function ownership and grants**

For every function, use `security definer set search_path = ''`, fully qualify identifiers, revoke from `PUBLIC`, and grant only its caller. Revoke table DML after all table creation. Keep table select for `service_role`; grant authenticated select only through RLS.

- [ ] **Step 9: Run all database tests and commit**

```bash
supabase db reset
supabase test db
git add supabase/migrations/202607280001_ai_tasks.sql supabase/tests/ai_task_transitions.test.sql
git commit -m "feat: authorize gateway task dispatch in PostgreSQL"
```

Expected: every pgTAP suite PASS.

---

### Task 5: Add authenticated web task creation and cancellation routes

**Files:**
- Create: `apps/web/src/features/ai/task-service.ts`
- Create: `apps/web/src/features/ai/task-service.test.ts`
- Create: `apps/web/src/app/api/ai/tasks/route.ts`
- Create: `apps/web/src/app/api/ai/tasks/route.test.ts`
- Create: `apps/web/src/app/api/ai/tasks/[taskId]/cancel/route.ts`
- Create: `apps/web/src/app/api/ai/tasks/[taskId]/cancel/route.test.ts`

**Interfaces:**
- Consumes: authenticated server Supabase client, `AIContextManifestSchema`, provider/task-kind schemas, and Task 2 RPCs.
- Produces:
  - `CreateAITaskInputSchema`
  - `buildAuthorizedRoomContextManifest(supabase, roomId)`
  - `createAITask(supabase, input)`
  - `cancelAITask(supabase, taskId)`
  - `POST /api/ai/tasks`
  - `POST /api/ai/tasks/:taskId/cancel`

- [ ] **Step 1: Write failing manifest-construction tests**

Mock four RLS-scoped Supabase queries and assert:

```ts
expect(
  await buildAuthorizedRoomContextManifest(supabase, ROOM_ID),
).toEqual({
  messageIds: [MESSAGE_ID],
  attachmentIds: [ATTACHMENT_ID],
  evidenceIds: [EVIDENCE_ID],
  decisionIds: [DECISION_ID],
});

expect(JSON.stringify(manifest)).not.toContain("storage_path");
expect(JSON.stringify(manifest)).not.toContain("signedUrl");
expect(JSON.stringify(manifest)).not.toContain("Validated interview text");
```

Include only linked, non-discard-pending attachments. Surface any query error instead of silently creating a partial manifest.

- [ ] **Step 2: Write failing RPC mapping tests**

Assert `createAITask` calls:

```ts
supabase.rpc("create_ai_task", {
  target_room_id: input.roomId,
  target_device_id: input.deviceId,
  target_provider: input.provider,
  target_kind: input.kind,
  target_instruction: input.instruction,
  target_manifest: manifest,
});
```

Assert it parses returned fields with `AITaskSchema`. Assert cancel calls `cancel_ai_task` and never sends a user ID or organization ID.

- [ ] **Step 3: Write failing route tests**

Mock `createClient`, send valid/invalid JSON requests, and assert `201` for creation, `200` for cancellation, `400` for Zod input errors, `401` for missing claims, and a stable non-sensitive `409` response for database authorization/state conflicts. Never return raw Postgres messages.

- [ ] **Step 4: Run web tests and verify failure**

```bash
pnpm --filter @meld/web test -- src/features/ai/task-service.test.ts src/app/api/ai/tasks/route.test.ts
```

Expected: FAIL because the service and routes do not exist.

- [ ] **Step 5: Implement the service**

Define:

```ts
export const CreateAITaskInputSchema = z.object({
  roomId: z.string().uuid(),
  deviceId: z.string().uuid(),
  provider: ProviderSchema,
  kind: AITaskKindSchema,
  instruction: z.string().trim().min(1).max(MAX_INSTRUCTION_CHARS),
});
```

`buildAuthorizedRoomContextManifest` runs the four identifier-only queries in parallel, orders each by stable `created_at,id` where available, parses with `AIContextManifestSchema`, and throws `"We could not build the authorized room context."` on any error. `createAITask` invokes the RPC; `cancelAITask` invokes cancel; both translate missing data/errors to stable application messages.

- [ ] **Step 6: Implement thin authenticated routes**

Each handler constructs `createClient(new Headers())`, verifies claims with `supabase.auth.getClaims()`, parses the body/path, and calls the service. Return:

```ts
return Response.json(task, { status: 201 });
```

for creation and `{ task }` with status 200 for cancellation. Route files must not import or read a service-role key.

- [ ] **Step 7: Run web checks and commit**

```bash
pnpm --filter @meld/web test -- src/features/ai
pnpm --filter @meld/web typecheck
pnpm --filter @meld/web lint
git add apps/web/src/features/ai apps/web/src/app/api/ai
git commit -m "feat: create authorized AI tasks from the web"
```

Expected: PASS.

---

### Task 6: Make the gateway package runnable and add its typed RPC repository

**Files:**
- Modify: `apps/gateway/package.json`
- Modify: `apps/gateway/tsconfig.json`
- Create: `apps/gateway/tsup.config.ts`
- Create: `apps/gateway/vitest.config.ts`
- Create: `apps/gateway/vitest.integration.config.ts`
- Create: `apps/gateway/src/config.ts`
- Create: `apps/gateway/src/config.test.ts`
- Create: `apps/gateway/src/tasks/task-repository.ts`
- Create: `apps/gateway/src/tasks/task-repository.test.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: service-role Supabase URL/key and all gateway RPCs from Tasks 3–4.
- Produces:
  - `GatewayConfig` and `readGatewayConfig(env)`
  - `createTaskRepository(supabase)`
  - One typed method per gateway RPC.
  - Runnable ESM bundle at `apps/gateway/dist/main.js`.

- [ ] **Step 1: Install exact runtime and development dependencies**

Run:

```bash
pnpm --filter @meld/gateway add --save-exact \
  @fastify/websocket@11.3.0 \
  @supabase/supabase-js@2.109.0 \
  '@meld/contracts@workspace:*' \
  zod@4.4.3 \
  ws@8.21.1
pnpm --filter @meld/gateway add --save-dev --save-exact \
  @types/node@20.19.43 \
  @types/ws@8.18.1 \
  postgres@3.4.9 \
  tsup@8.5.1 \
  tsx@4.23.1 \
  vitest@4.1.10
```

Expected: `package.json` and `pnpm-lock.yaml` change; all versions are exact except the required `workspace:*` link.

- [ ] **Step 2: Write failing config tests**

Test missing URL/key, invalid integers, default port/poll/heartbeat, and lease ceiling:

```ts
expect(() =>
  assertHeartbeatWithinLease({ heartbeatSeconds: 31, leaseSeconds: 90 }),
).toThrow("GATEWAY_HEARTBEAT_SECONDS must be at most 30");
```

- [ ] **Step 3: Write failing repository mapping tests**

Mock `supabase.rpc` and assert each camel-case method sends exact snake-case arguments. Include claim, hydration, append, renew, settle, cancel acknowledgement, dispatch listing, reaping, device auth, connection record, provider upsert, and `get_ai_task_lease_seconds`. Assert any PostgREST error becomes `GatewayRepositoryError` with its database message retained only internally.

- [ ] **Step 4: Run gateway tests and verify failure**

```bash
pnpm --filter @meld/gateway test -- src/config.test.ts src/tasks/task-repository.test.ts
```

Expected: FAIL because config and repository modules do not exist.

- [ ] **Step 5: Configure scripts and bundling**

Set scripts:

```json
{
  "build": "tsup",
  "dev": "tsx watch src/main.ts",
  "start": "node dist/main.js",
  "test": "vitest run --config vitest.config.ts",
  "test:integration": "vitest run --config vitest.integration.config.ts",
  "typecheck": "tsc --noEmit"
}
```

Keep `noEmit: true`. Configure tsup:

```ts
export default defineConfig({
  entry: ["src/main.ts"],
  format: ["esm"],
  platform: "node",
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  noExternal: ["@meld/contracts"],
});
```

The unit Vitest config excludes `**/*.integration.test.ts`; the integration config includes only that pattern and runs serially.

- [ ] **Step 6: Implement validated configuration**

Parse `GATEWAY_PORT` default 8787, poll default 3000 ms, heartbeat default 30 seconds, required Supabase URL/key, and optional host default `0.0.0.0`. Export `assertHeartbeatWithinLease` separately so startup can compare the configured cadence with `ai_task_lease_duration()` returned by PostgreSQL.

- [ ] **Step 7: Implement the repository wrapper**

Define focused return types (`AuthenticatedDevice`, `ClaimedTask`, `HydratedContext`, `DispatchableTask`, `RenewedLease`, `SettlementAck`) and one method per SQL function. Use a shared:

```ts
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const result = await supabase.rpc(name, args);
  if (result.error) throw new GatewayRepositoryError(name, result.error);
  return result.data as T;
}
```

No method calls `.from(...).insert/update/delete`.

- [ ] **Step 8: Run unit, type, and bundle checks**

```bash
pnpm --filter @meld/gateway test
pnpm --filter @meld/gateway typecheck
pnpm --filter @meld/gateway build
node apps/gateway/dist/main.js
```

For the last command, Expected: a clear configuration error naming the first missing gateway environment variable, not a TypeScript/ESM resolution error.

- [ ] **Step 9: Commit the runnable foundation**

```bash
git add apps/gateway/package.json apps/gateway/tsconfig.json \
  apps/gateway/tsup.config.ts apps/gateway/vitest.config.ts \
  apps/gateway/vitest.integration.config.ts apps/gateway/src/config.ts \
  apps/gateway/src/config.test.ts apps/gateway/src/tasks pnpm-lock.yaml
git commit -m "feat: make the device gateway runnable"
```

---

### Task 7: Implement device credentials, upgrade authentication, and connection sessions

**Files:**
- Create: `apps/gateway/src/auth/device-token.ts`
- Create: `apps/gateway/src/auth/device-token.test.ts`
- Create: `apps/gateway/src/auth/device-auth.ts`
- Create: `apps/gateway/src/auth/device-auth.test.ts`
- Create: `apps/gateway/src/ws/device-session.ts`
- Create: `apps/gateway/src/ws/device-session.test.ts`
- Modify: `apps/gateway/src/server.ts`
- Modify: `apps/gateway/src/server.test.ts`

**Interfaces:**
- Consumes: Task 6 `TaskRepository`, `@fastify/websocket`, and `ws`.
- Produces:
  - `mintDeviceCredential(deviceId)`
  - `hashDeviceSecret(secret)` and `verifyDeviceSecret(secret, digest)`
  - `authenticateDevice(authorization, repository)`
  - `DeviceSession` and `DeviceSessionRegistry`
  - `buildServer({ config, repository, registry, onMessage, onConnect })`

- [ ] **Step 1: Write failing token tests**

Assert 32 random bytes become base64url without padding, credentials format as `<uuid>.<secret>`, hashes are 64 lowercase hex characters, valid secrets compare true, wrong/malformed digests compare false without throwing, and plaintext never appears in the hash.

- [ ] **Step 2: Write failing authentication tests**

Cover missing/malformed scheme, missing device, revoked device, wrong secret, and success. For an unknown device, spy on the verifier and assert it still performs a comparison against a fixed dummy 32-byte digest. On success, assert `recordDeviceConnection` is called only after constant-time verification.

- [ ] **Step 3: Write failing session registry/server tests**

Assert multiple sockets may share one device ID, connected IDs are deduplicated, unregistering one socket does not hide another, `sendToDevice` broadcasts to open sockets, `/health` remains 200, unauthorized upgrade returns 401 before the WebSocket handler, and accepted sessions receive:

```json
{ "type": "session.accepted", "heartbeatSeconds": 30 }
```

- [ ] **Step 4: Run the focused suite and verify failure**

```bash
pnpm --filter @meld/gateway test -- src/auth src/ws/device-session.test.ts src/server.test.ts
```

Expected: FAIL because credential/session modules and the WebSocket route do not exist.

- [ ] **Step 5: Implement credential primitives**

Use `randomBytes`, `createHash("sha256")`, and `timingSafeEqual`. Parse only `Authorization: Device <uuid>.<base64url>`. Always normalize both digests to 32-byte buffers before timing comparison; malformed inputs return false.

- [ ] **Step 6: Implement authentication**

`authenticateDevice` parses the header, fetches `getExecutionDeviceForAuth`, compares the presented secret against the real or dummy digest, rejects non-active/revoked devices with one generic `Device authentication failed` error, records the connection, and returns `{ id, userId }`. Never log the header, secret, or token hash.

- [ ] **Step 7: Implement session and registry**

`DeviceSession.send(message)` serializes only values already parsed by `ServerToDeviceMessageSchema`. Track last heartbeat in memory for socket cleanup only, not task recovery. Registry methods are `add`, `remove`, `connectedDeviceIds`, `sendToDevice`, and `closeAll`.

- [ ] **Step 8: Register WebSocket support with the size ceiling**

Register `@fastify/websocket` with:

```ts
await server.register(websocket, {
  options: { maxPayload: 1024 * 1024 },
});
```

Authenticate in `preValidation`, attach the authenticated device to the request, register/unregister the session around socket lifetime, emit `session.accepted`, call injected `onConnect(deviceId)`, and hand every message to injected `onMessage(session, data)`.

- [ ] **Step 9: Run checks and commit**

```bash
pnpm --filter @meld/gateway test
pnpm --filter @meld/gateway typecheck
pnpm --filter @meld/gateway lint
git add apps/gateway/src/auth apps/gateway/src/ws/device-session.ts \
  apps/gateway/src/ws/device-session.test.ts apps/gateway/src/server.ts \
  apps/gateway/src/server.test.ts
git commit -m "feat: authenticate gateway device sessions"
```

---

### Task 8: Route validated device protocol frames and map database outcomes

**Files:**
- Create: `apps/gateway/src/ws/protocol-handler.ts`
- Create: `apps/gateway/src/ws/protocol-handler.test.ts`

**Interfaces:**
- Consumes: Task 1 message schemas, Task 6 repository, and Task 7 `DeviceSession`.
- Produces: `createProtocolHandler({ repository }).handle(session, rawFrame)`.

- [ ] **Step 1: Write failing validation and close-policy tests**

Assert invalid JSON, binary frames, unknown types, missing attempt IDs, oversized arrays, and unknown event types close with code 1008. Assert a stale-attempt repository error sends `task.operation_rejected` but leaves the socket open. Assert conflicting/out-of-order event errors send rejection and close 1008.

- [ ] **Step 2: Write failing heartbeat/provider tests**

For heartbeat, assert `recordDeviceConnection` receives the connector version, `renewTaskLeases` receives at most 32 active pairs, and the session receives exactly:

```ts
{
  type: "heartbeat.ack",
  renewedTasks: [{ taskId: TASK_ID, attemptId: ATTEMPT_ID }],
}
```

For provider status, assert only schema-parsed provider fields reach `upsertProviderConnections`.

- [ ] **Step 3: Write failing claim/event/settlement tests**

Assert claim calls claim then hydrate and emits one payload. If hydration fails `permission_changed`, emit `task.claim_rejected` and no payload. Exact event replay emits `task.event_ack` with task, attempt, and sequence. Complete/fail settlement emits `task.terminal_ack`; identical retry emits the same ack; contradictory retry emits `task.operation_rejected`. `task.cancelled` calls `acknowledgeTaskCancellation`, not `settleTask`.

- [ ] **Step 4: Run the focused suite and verify failure**

```bash
pnpm --filter @meld/gateway test -- src/ws/protocol-handler.test.ts
```

Expected: FAIL because the handler does not exist.

- [ ] **Step 5: Implement one parse-and-dispatch boundary**

Convert only text `RawData` to UTF-8, `JSON.parse`, then:

```ts
const parsed = DeviceToServerMessageSchema.safeParse(value);
if (!parsed.success) {
  session.close(1008, "Invalid device protocol frame");
  return;
}
```

Use an exhaustive `switch (parsed.data.type)` with a `never` check. Do not cast unparsed payloads.

- [ ] **Step 6: Implement heartbeat, provider, and claim routing**

Heartbeat records liveness, renews exact task/attempt pairs, and sends `heartbeat.ack`. Provider status calls its one repository method. Claim calls `claimTask`, then `hydrateAuthorizedRoomContext`; parse the hydrated JSON with `AIContextPackageSchema` before sending `task.payload`.

Map `ai_task_claim_rejected`, `permission_changed`, and context-size failure to `task.claim_rejected`; never emit partial context.

- [ ] **Step 7: Implement event and settlement routing**

Event calls append and returns an attempt-qualified ack. Complete calls settle with operation `complete`, result, null error fields, and result.partial. Fail calls settle with operation `fail`, code/message, and null result. Cancelled calls cancellation acknowledgement and returns terminal ack with `cancelled`.

Centralize database error mapping:

```ts
const CLOSE_AFTER_REJECTION = new Set([
  "out_of_order_ai_task_event",
  "conflicting_ai_task_event",
  "conflicting_ai_task_settlement",
]);
```

Leave the socket open for `stale_ai_task_attempt` because fencing can race with a correct connector.

- [ ] **Step 8: Run checks and commit**

```bash
pnpm --filter @meld/gateway test
pnpm --filter @meld/gateway typecheck
pnpm --filter @meld/gateway lint
git add apps/gateway/src/ws/protocol-handler.ts apps/gateway/src/ws/protocol-handler.test.ts
git commit -m "feat: handle fenced gateway task protocol"
```

---

### Task 9: Add durable announcement sweeps, startup/shutdown, and manual connector tools

**Files:**
- Create: `apps/gateway/src/dispatch/sweeper.ts`
- Create: `apps/gateway/src/dispatch/sweeper.test.ts`
- Create: `apps/gateway/src/main.ts`
- Create: `apps/gateway/src/main.test.ts`
- Create: `scripts/seed-device.ts`
- Create: `scripts/fake-connector.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: repository, session registry, server builder, protocol handler, token helpers, and dev-only Postgres.js.
- Produces:
  - `createDispatchSweeper({ repository, registry, intervalMs })`
  - Executable gateway entrypoint with graceful shutdown.
  - `pnpm exec tsx scripts/seed-device.ts`
  - `pnpm exec tsx scripts/fake-connector.ts`

- [ ] **Step 1: Write failing sweeper tests**

Assert every tick passes the entire connected-device set to `listDispatchableTasks`, sends `task.available` for every returned ready row even if it was ready before this tick, sends pending `task.cancel` with the settled attempt ID, and calls the reaper. Simulate a throw and assert the next scheduled tick still runs. `sweepDevice(deviceId)` must use the same path scoped to one newly connected device.

- [ ] **Step 2: Write failing startup tests**

Inject fake config/repository/server/timers. Assert startup reads the database lease before listening, rejects heartbeat 31 against lease 90, starts the sweeper only after the server listens, and SIGTERM/SIGINT stop timers, close sockets, then close Fastify exactly once.

- [ ] **Step 3: Run focused tests and verify failure**

```bash
pnpm --filter @meld/gateway test -- src/dispatch/sweeper.test.ts src/main.test.ts
```

Expected: FAIL because the sweeper and entrypoint do not exist.

- [ ] **Step 4: Implement announce-by-state sweeping**

Use a non-overlapping timer: schedule the next `setTimeout` only after the current tick settles. For every returned row:

```ts
if (row.kind === "available") {
  registry.sendToDevice(row.deviceId, {
    type: "task.available",
    taskId: row.taskId,
  });
} else {
  registry.sendToDevice(row.deviceId, {
    type: "task.cancel",
    taskId: row.taskId,
    attemptId: row.attemptId,
  });
}
```

Do not remember which tasks were announced; database state is deliberately re-announced.

- [ ] **Step 5: Implement startup and graceful shutdown**

Create the service-role client with `persistSession: false`, instantiate repository/registry/protocol/sweeper/server, query lease duration, validate heartbeat ceiling, listen, start sweeping, and wire one idempotent shutdown function for SIGINT/SIGTERM. Export `startGateway(dependencies?)` for tests and invoke it only when `main.ts` is the entry module.

- [ ] **Step 6: Implement owner-level device seeding**

`seed-device.ts` requires `SUPABASE_DB_URL`, optional user/name/provider flags, calls `mintDeviceCredential`, and uses Postgres.js as database owner to insert one active device plus provider connection. Print the plaintext credential exactly once to stdout and never log it again. Close the database connection in `finally`.

- [ ] **Step 7: Implement the fake connector**

Accept gateway URL and device credential, use the `ws` client, parse every server frame with `ServerToDeviceMessageSchema`, heartbeat on the accepted cadence, claim available tasks, send ordered progress/text events, and complete with a small `AIResultEnvelope`. Add flags:

```text
--drop-after-claim
--gap-at <sequence>
--replay <sequence>
--hold-heartbeats
--drop-before-terminal-ack
```

Abort the local simulated run when its task/attempt pair is absent from `heartbeat.ack.renewedTasks`.

- [ ] **Step 8: Document configuration**

Append:

```dotenv
GATEWAY_PORT=8787
GATEWAY_SUPABASE_URL=http://127.0.0.1:54321
GATEWAY_SUPABASE_SERVICE_ROLE_KEY=
GATEWAY_POLL_INTERVAL_MS=3000
GATEWAY_HEARTBEAT_SECONDS=30
# Local development and gateway integration fixtures only.
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

Do not add a lease-duration variable.

- [ ] **Step 9: Run unit and bundle checks, then commit**

```bash
pnpm --filter @meld/gateway test
pnpm --filter @meld/gateway typecheck
pnpm --filter @meld/gateway lint
pnpm --filter @meld/gateway build
git add apps/gateway/src/dispatch apps/gateway/src/main.ts \
  apps/gateway/src/main.test.ts scripts/seed-device.ts \
  scripts/fake-connector.ts .env.example
git commit -m "feat: dispatch durable AI tasks through the gateway"
```

---

### Task 10: Automate durability and concurrency against a live local stack

**Files:**
- Create: `apps/gateway/src/integration-fixtures.ts`
- Create: `apps/gateway/src/integration-fixtures.integration.test.ts`
- Create: `apps/gateway/src/server.integration.test.ts`

**Interfaces:**
- Consumes: full local Supabase stack, owner DB URL, gateway entrypoint, and `ws`.
- Produces: deterministic multi-connection tests for Task 6's durability claims.

- [ ] **Step 1: Build deterministic owner-level fixtures**

Use Postgres.js only from `integration-fixtures.ts`. Export:

```ts
export async function resetGatewayFixture(): Promise<GatewayFixture>;
export async function createReadyTask(fixture: GatewayFixture): Promise<string>;
export async function expireAttempt(attemptId: string): Promise<void>;
export async function readTask(taskId: string): Promise<TaskSnapshot>;
```

Insert fixed UUID users, organization, memberships, room participation, context rows, device/provider rows, and tasks. Delete only fixed fixture IDs in setup/teardown. Never truncate shared schemas.

- [ ] **Step 2: Write the same-device claim race**

Open two sockets authenticated with the same device credential, receive the same repeatable `task.available`, send simultaneous `task.claim`, and assert exactly one `task.payload`, one `task.claim_rejected`, one current attempt row, and one hydrated context package.

- [ ] **Step 3: Write restart-window durability tests**

Add:

1. Start gateway, claim, stop gateway, restart, reconnect with the same attempt, renew, and complete.
2. Inject a registry send failure after `list_dispatchable_ai_tasks` commits ready state; restart gateway and assert the existing ready task is re-announced.
3. Stop heartbeats, expire/reap, create a new attempt, and assert settlement from the old attempt is rejected without changing the new attempt/result.

- [ ] **Step 4: Write expiry, settlement, and cancellation tests**

Add:

1. Heartbeat immediately after owner-set expiry but before reaper: `heartbeat.ack.renewedTasks` excludes it; reaper settles it.
2. Zero-event expiry returns to waiting; eventful expiry becomes `needs_review/execution_abandoned`.
3. Terminal settlement committed before socket drop replays to the same terminal ack.
4. `needs_review` settlement committed before drop also replays to the same ack.
5. A different completion result from the settled attempt is rejected as conflicting.
6. Cancellation created while gateway is stopped is delivered after restart, acknowledged, and not delivered on a later sweep.

- [ ] **Step 5: Write sequence gap/replay tests**

Send sequence 1, then 3 and assert out-of-order rejection/close. Reconnect while the attempt is still current, replay identical sequence 1 and receive its ack, then replay sequence 1 with a changed payload and assert conflicting rejection without another event row.

- [ ] **Step 6: Run integration tests locally**

Run:

```bash
supabase start
supabase db reset
GATEWAY_SUPABASE_URL=http://127.0.0.1:54321 \
GATEWAY_SUPABASE_SERVICE_ROLE_KEY="$(supabase status -o env | sed -n 's/^SERVICE_ROLE_KEY=\"\\(.*\\)\"$/\\1/p')" \
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
pnpm --filter @meld/gateway test:integration
supabase stop --no-backup
```

Expected: every integration test PASS and the final stop removes local containers without preserving test data.

- [ ] **Step 7: Commit integration coverage**

```bash
git add apps/gateway/src/integration-fixtures.ts \
  apps/gateway/src/integration-fixtures.integration.test.ts \
  apps/gateway/src/server.integration.test.ts
git commit -m "test: cover gateway lease and restart durability"
```

---

### Task 11: Enforce enum parity, test colocation, CI execution, and final verification

**Files:**
- Create: `scripts/check-contract-enum-parity.mjs`
- Create: `scripts/check-contract-enum-parity.test.mjs`
- Modify: `scripts/check-test-colocation.mjs`
- Modify: `scripts/check-test-colocation.test.mjs`
- Modify: `scripts/check-sql-arities.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/product-feature-checklist.md`

**Interfaces:**
- Consumes: completed migration, contracts, unit suites, and gateway integration suite.
- Produces: CI gates that prevent SQL/contract drift and ensure live durability tests run on every PR.

- [ ] **Step 1: Write failing enum-parity checker tests**

Provide a tiny SQL fixture and contract enum fixture. Assert equal sets pass, a missing SQL value reports both enum name and missing value, an extra SQL value reports it, and a missing migration file fails rather than making the check vacuous.

- [ ] **Step 2: Implement enum parity**

Parse `202607280001_ai_tasks.sql` with `pgsql-parser` and compare the exact sets for provider, task kind/status, provider installation/authentication/compatibility, and task error code against exports from `@meld/contracts`. Add root scripts:

```json
{
  "check:contract-enums": "node scripts/check-contract-enum-parity.mjs",
  "test:contract-enums": "node --test scripts/check-contract-enum-parity.test.mjs"
}
```

Include both commands in `test:sql`.

- [ ] **Step 3: Extend static checks**

Change `check:test-colocation` to:

```json
"check:test-colocation": "node scripts/check-test-colocation.mjs apps/web apps/gateway"
```

Add every new SQL function and exact arity to `SQL_FUNCTION_ARITIES`, including overloaded enum arguments. Update checker tests with at least one new AI-task signature.

- [ ] **Step 4: Add the live gateway CI job**

Append a `gateway-integration` job with pinned setup versions:

```yaml
gateway-integration:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
      with:
        version: 10.28.1
    - uses: actions/setup-node@v4
      with:
        node-version: "20.19.0"
        cache: pnpm
    - uses: supabase/setup-cli@v1
      with:
        version: 2.109.1
    - run: pnpm install --frozen-lockfile
    - run: supabase start
    - name: Wait for Supabase API
      run: |
        for attempt in $(seq 1 60); do
          if curl --fail --silent http://127.0.0.1:54321/rest/v1/ >/dev/null; then
            exit 0
          fi
          sleep 2
        done
        supabase status
        exit 1
    - name: Export local credentials
      run: |
        service_key="$(
          supabase status -o env |
            sed -n 's/^SERVICE_ROLE_KEY="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p'
        )"
        test -n "$service_key"
        echo "LOCAL_SUPABASE_SERVICE_ROLE_KEY=$service_key" >> "$GITHUB_ENV"
    - run: pnpm --filter @meld/gateway test:integration
      env:
        GATEWAY_SUPABASE_URL: http://127.0.0.1:54321
        GATEWAY_SUPABASE_SERVICE_ROLE_KEY: ${{ env.LOCAL_SUPABASE_SERVICE_ROLE_KEY }}
        SUPABASE_DB_URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
    - if: always()
      run: supabase stop --no-backup
```

The pinned CLI emits `SERVICE_ROLE_KEY`; the export step strips optional quotes and fails if it is absent. Do not hardcode a local JWT.

- [ ] **Step 5: Mark Task 6 accurately in the product checklist**

Record database/gateway Task 6 as complete while leaving pairing, provider execution, mention-trigger UI, PRD generation, artifacts, Define/Design rooms, and full lifecycle E2E incomplete. State the single-instance gateway constraint and the Task 7 self-fencing obligation.

- [ ] **Step 6: Run the complete local validation**

Run:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
supabase db reset
supabase test db
pnpm --filter @meld/gateway test:integration
```

Expected: every command PASS. Confirm `apps/gateway/dist/main.js` exists and:

```bash
node apps/gateway/dist/main.js
```

fails only for missing environment configuration when run without env, proving the bundle contains no unresolved TypeScript or extensionless ESM import.

- [ ] **Step 7: Perform the security self-check**

Search the finished diff and verify:

```bash
grep -R "SERVICE_ROLE" -n apps/web || true
grep -R "storage_path\\|signedUrl" -n apps/gateway/src packages/contracts/src || true
grep -R "\\.from(.*)\\.\\(insert\\|update\\|delete\\)" -n apps/gateway/src || true
grep -R "GATEWAY_TASK_LEASE" -n . --exclude-dir=node_modules --exclude-dir=.git || true
```

Expected: no service-role reference in web, no storage URL/path in gateway contracts, no direct gateway DML, and no gateway lease environment variable. Review any grep hit rather than deleting legitimate test assertions.

- [ ] **Step 8: Commit CI and documentation**

```bash
git add scripts/check-contract-enum-parity.mjs \
  scripts/check-contract-enum-parity.test.mjs \
  scripts/check-test-colocation.mjs scripts/check-test-colocation.test.mjs \
  scripts/check-sql-arities.mjs package.json .github/workflows/ci.yml \
  docs/product-feature-checklist.md
git commit -m "ci: enforce durable gateway validation"
```

---

## Final acceptance checklist

- [ ] A task created under a user session can reference only that user's active device/provider and its room's organization.
- [ ] Revoking room access after creation prevents any context bytes from reaching the device.
- [ ] The gateway can restart before announcement, after claim, and before terminal acknowledgement without losing authoritative state.
- [ ] Exact event and settlement retries acknowledge; gaps and conflicting retries reject.
- [ ] An expired lease cannot be renewed, write an event, or settle a task.
- [ ] Eventless abandoned work requeues; work with persisted events requires user review.
- [ ] Cancellation survives gateway downtime and stops redelivery after acknowledgement.
- [ ] The Node 20 production bundle runs without loading TypeScript source from `@meld/contracts`.
- [ ] Unit, pgTAP, live integration, typecheck, lint, build, enum parity, SQL arity, and colocation checks all run in CI.
- [ ] Later tasks have explicit obligations: Task 7 aborts provider child processes when renewal fencing occurs; Task 10 renders exactly one authoritative attempt stream.
