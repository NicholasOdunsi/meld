# Device Pairing Residual Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the residual rollback, concurrency, configuration, and documentation blockers found by the scoped review of the device-pairing final fix wave.

**Architecture:** PostgreSQL task operations use one canonical lock order—execution device, AI task, then attempt—and live tests deterministically reproduce the old deadlock and heartbeat/revoke race. Keychain re-pairing uses checked compensation with stateful failure tests, while the public pairing route distinguishes server misconfiguration from intentionally uniform invalid-code failures. Documentation is corrected to match the reviewed implementation and evidence.

**Tech Stack:** PostgreSQL/pgTAP, `postgres`, TypeScript, Vitest, Next.js App Router, macOS `/usr/bin/security` command adapter, pnpm/Turbo.

**Governing design:** `docs/design/specs/2026-07-28-device-pairing-and-persistent-connector-design.md`

## Global Constraints

- Node `20.19.0`; pnpm `10.28.1`; dependencies remain pinned exactly.
- Server-only pairing redemption remains `service_role`-only and its key must never reach browser code, logs, errors, files, or test snapshots.
- Invalid, expired, and redeemed pairing codes remain byte-identical public `400` responses.
- Server configuration failure is not a pairing-code failure: it must produce an actionable server diagnostic and a stable public `500` without exposing key material.
- Every SQL task operation that touches more than one durable object locks in this order: execution device → AI task → task attempt. Device collections and task collections are ordered by UUID before locking.
- A concurrent revoke must serialize before heartbeat/task mutation; after revoke commits, the waiting operation observes revoked/inactive state and performs no renewal/event/settlement.
- Keychain secrets remain token-only under service `com.meld.agent`; the recovery index contains only the non-secret device ID.
- Keychain compensation must check both thrown runner failures and nonzero command results. Compensation failure must be explicit and sanitized, never silently reported as successful rollback.
- `supabase/.branches/` and `supabase/.temp/` are preserved.
- The real-Keychain, Terminal-close, and reboot observations remain pending.

---

### Task 1: Canonical SQL Lock Ordering and Mutation-Sensitive Revocation Evidence

**Files:**
- Modify: `supabase/migrations/202607280001_ai_tasks.sql`
- Modify: `supabase/migrations/202607280002_device_pairing.sql`
- Modify: `supabase/tests/ai_task_transitions.test.sql`
- Modify: `apps/connector/src/pairing/pairing-client.integration.test.ts`
- Modify: `.github/workflows/ci.yml` only if the existing connector integration environment needs no-longer-present variables

**Interfaces:**
- Consumes: the current active-device fences and `revoke_execution_device`.
- Produces: canonical device → task → attempt locking for `claim_ai_task`, `append_ai_task_event`, `renew_ai_task_leases`, `settle_ai_task`, `acknowledge_task_cancellation`, `hydrate_authorized_room_context`, and dispatch paths.
- Produces: live regression tests whose old implementation deadlocks or returns active during an uncommitted revoke.

- [ ] **Step 1: Add the deterministic deadlock regression**

In `pairing-client.integration.test.ts`, use three independent PostgreSQL connections and the existing durable task fixture:

1. Connection C begins a transaction and locks the target `execution_devices` row.
2. Connection A invokes `renew_ai_task_leases`, queuing first on the device row.
3. Connection B invokes `append_ai_task_event`, queuing second.
4. Release Connection C.
5. Assert both product calls settle without PostgreSQL `40P01`, the event sequence is stored once, and the renewed attempt remains valid.

Why this is mutation-sensitive: the old append path locks task/attempt before queuing on the device. When C releases, A receives the device and waits on B's attempt lock while B waits on A's device lock, producing a real deadlock. With canonical device-first ordering, B holds no task/attempt lock while queued.

- [ ] **Step 2: Add the deterministic heartbeat/revoke regression**

Using two independent connections:

1. Begin a transaction as the owning authenticated user.
2. Call `revoke_execution_device` without committing.
3. In the second connection, call `record_device_connection` and `renew_ai_task_leases`.
4. Assert both calls remain pending for at least 100 ms while revoke holds the row.
5. Commit revoke.
6. Assert connection recording returns `revoked`, lease renewal returns no attempts, and task lease/event state did not advance.

This test must fail if the device row lock/recheck is removed: an unlocked MVCC read sees the pre-commit active row.

- [ ] **Step 3: Run the live integration and verify RED**

Run:

```bash
pnpm --filter @meld/connector test:integration
```

Expected before the lock-order correction: the deterministic event/renew scenario rejects with SQLSTATE `40P01`, or the revoke scenario resolves active/renews before the revoke commits.

- [ ] **Step 4: Apply canonical lock ordering**

For every affected security-definer function:

1. Resolve the target device ID without a row lock only when the signature lacks it.
2. Lock the execution-device row first and validate `status = 'active'` and `revoked_at is null`.
3. Lock the AI-task row second.
4. Lock the attempt row third.
5. Revalidate device/task/attempt identity after all locks are held before mutation.

Specific requirements:

- `append_ai_task_event` and `settle_ai_task`: move the device lock before task and attempt selects.
- `hydrate_authorized_room_context`: read the task's device ID into a scalar, lock that device, then lock and revalidate task, then attempt.
- `renew_ai_task_leases`: retain device-first locking; ensure attempts are acquired in deterministic UUID order before update if more than one is requested.
- `claim_ai_task`: retain device → task and use ordered attempt-number calculation.
- `list_dispatchable_ai_tasks`: lock connected devices ordered by UUID, then tasks ordered by UUID.
- `record_device_connection`: retain `FOR UPDATE` and return the locked status; update only while the same locked row is active.
- `revoke_execution_device`: lock/update the same device row so it serializes with all service-role task operations.

- [ ] **Step 5: Add pgTAP/static assertions**

Keep the existing revoked-boundary assertions and add mutation-sensitive SQL checks for:

- revoked connection advances neither connector version nor `last_seen_at`;
- revoked lease/event/settlement calls leave attempt/task rows unchanged;
- all active-device paths still succeed.

Update `plan(N)` exactly. If a static lock-order checker is added, it must parse named function bodies and assert device/task/attempt `FOR UPDATE` ordering rather than searching the entire file globally.

- [ ] **Step 6: Run focused and database validation**

```bash
pnpm test:sql
pnpm dlx supabase@2.109.1 test db
pnpm --filter @meld/gateway test
pnpm --filter @meld/connector test:integration
```

Expected: all PASS; the connector integration includes both deterministic concurrency tests without timeout/deadlock.

- [ ] **Step 7: Commit**

```bash
git add supabase apps/connector/src/pairing .github/workflows/ci.yml
git commit -m "fix: serialize revoked device task operations"
```

---

### Task 2: Keychain Re-pair Compensation With Stateful Invariant Tests

**Files:**
- Modify: `apps/connector/src/pairing/keychain-store.ts`
- Modify: `apps/connector/src/pairing/keychain-store.test.ts`
- Modify: `apps/connector/src/pairing/pairing-client.test.ts` only if the public sanitized error contract changes

**Interfaces:**
- Consumes: `CommandRunner`, `CURRENT_DEVICE_ACCOUNT`, token-only device entries.
- Produces: checked compensation that either restores the previous `{index, old secret}` and removes the new secret, or throws an explicit sanitized incomplete-cleanup error.

- [ ] **Step 1: Build a stateful fake Keychain runner**

In `keychain-store.test.ts`, model generic-password entries with a `Map<account, secret>`. The runner must support fault injection by operation number with both modes:

- mutate the map, then throw (simulates a process/transport rejection after side effect);
- return a nonzero `CommandResult` without mutation.

Tests inspect the map after failure; assertions on error text alone are insufficient.

- [ ] **Step 2: Add failing compensation tests**

Cover:

- initial new-secret save mutates then throws: cleanup removes the new secret, preserves old secret and old index, and the store remains bound to the old device;
- index switch throws/nonzero: new secret is removed and old secret/index remain;
- previous-secret deletion throws/nonzero: compensation restores old index/secret and removes the new secret;
- restore-old-secret or restore-index returns nonzero: every remaining compensation still runs, the error explicitly says cleanup is incomplete, and token/cause sentinels are absent;
- successful re-pair leaves exactly two entries: current-device index → new device ID and new device ID → new token; the old device token is absent.

- [ ] **Step 3: Run the tests and verify RED**

```bash
pnpm --filter @meld/connector exec vitest run src/pairing/keychain-store.test.ts
```

Expected: current code leaves mutated new entries after a thrown initial save and treats nonzero restore results as successful compensation.

- [ ] **Step 4: Implement checked compensation**

- Wrap the initial `saveAccount(newDeviceId, newToken)` in `try/catch`; on a thrown result, attempt deletion of the new account before returning a sanitized save failure.
- Introduce a helper that converts both thrown runner errors and nonzero `CommandResult` into a sanitized stage error.
- `rollbackDeviceSwitch` must attempt every compensation, collect stage-labelled failures, and reject if any compensation failed. It may not ignore a fulfilled nonzero result.
- Update `this.deviceId` only after the new credential/index and previous-credential cleanup have all succeeded.
- Never include the token, runner stderr/stdout, or original error cause in the public error.

- [ ] **Step 5: Run connector validation**

```bash
pnpm --filter @meld/connector exec vitest run src/pairing
pnpm --filter @meld/connector test
pnpm --filter @meld/connector typecheck
pnpm --filter @meld/connector lint
```

Expected: PASS with map-state invariants asserted after every failure boundary.

- [ ] **Step 6: Commit**

```bash
git add apps/connector/src/pairing
git commit -m "fix: verify keychain re-pair compensation"
```

---

### Task 3: Clear Server Configuration Failure and Accurate Evidence

**Files:**
- Modify: `apps/web/src/app/api/devices/pair/route.ts`
- Modify: `apps/web/src/app/api/devices/pair/route.test.ts`
- Modify: `docs/design/plans/2026-07-28-device-pairing-and-persistent-connector.md`
- Modify: `.superpowers/sdd/2026-07-28-device-pairing-and-persistent-connector/final-fix-report.md`
- Create: `.superpowers/sdd/2026-07-29-device-pairing-residual-corrections/progress.md` through the SDD workspace helper

**Interfaces:**
- Consumes: `createDevicePairingServerClient`, uniform invalid-code response.
- Produces: stable public `500 {"error":"Device pairing is temporarily unavailable."}` for server configuration failure plus a sanitized server diagnostic naming the missing variable.

- [ ] **Step 1: Add the failing route test**

Mock `createDevicePairingServerClient` to throw:

```text
Invalid device pairing configuration: MELD_DEVICE_PAIRING_SERVICE_ROLE_KEY
```

Assert:

- response status is `500`;
- response body is exactly `{"error":"Device pairing is temporarily unavailable."}`;
- `recordPairFailure` is not consumed for a server configuration defect;
- one `console.error` diagnostic names `MELD_DEVICE_PAIRING_SERVICE_ROLE_KEY`;
- the response/log never contains the configured key value or request pairing code.

Keep existing invalid/expired/redeemed tests byte-identical at `400`.

- [ ] **Step 2: Run the test and verify RED**

```bash
pnpm --filter @meld/web exec vitest run src/app/api/devices/pair/route.test.ts
```

Expected: current route returns the uniform invalid-code `400` and records a client failure.

- [ ] **Step 3: Split configuration from redemption failure handling**

Create the server client in its own guarded block before the redemption `try`.
On configuration failure:

```ts
console.error("Device pairing server configuration error", error);
return Response.json(
  { error: "Device pairing is temporarily unavailable." },
  { status: 500, headers: responseHeaders },
);
```

Do not call `recordPairFailure` on this path. Keep all redemption/RPC failures in the existing sanitized `400` path without logging database details.

- [ ] **Step 4: Correct plan and report evidence**

- Replace the obsolete Task 3/upgrade instruction that says to ignore `recordDeviceConnection`'s returned status with the implemented requirement to reject non-active status.
- Amend the final-fix report so it no longer claims rollback at every boundary until Task 2's stateful tests pass; then record the exact new evidence and commits.
- Record the residual-correction validation and keep manual Mac items pending.

- [ ] **Step 5: Run web and documentation validation**

```bash
pnpm --filter @meld/web test
pnpm --filter @meld/web typecheck
pnpm --filter @meld/web lint
git diff --check
```

Expected: PASS, with invalid-code response uniformity unchanged.

- [ ] **Step 6: Commit**

```bash
git add apps/web docs/design/plans .superpowers/sdd
git commit -m "fix: surface device pairing configuration failures"
```

---

## Final Validation

After all three task reviews are clean:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm dlx supabase@2.109.1 test db
pnpm --filter @meld/gateway test:integration
pnpm --filter @meld/connector test:integration
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=e2e-placeholder-key \
MELD_DEVICE_PAIRING_SERVICE_ROLE_KEY=e2e-placeholder-server-key \
pnpm test:e2e
```

Run a fresh whole-branch review focused on lock ordering, Keychain post-failure state, configuration-key secrecy, and documentation accuracy. Do not proceed to manual Mac acceptance until that review is clean.
