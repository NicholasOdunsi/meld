# Task 3 Report: Pairing Configuration Failure and Evidence Corrections

## Status

DONE

## Implementation

- Moved `createDevicePairingServerClient()` into its own guarded block after
  request parsing and schema validation but before the redemption operation.
- A construction/configuration failure now returns exactly:

  ```text
  500 {"error":"Device pairing is temporarily unavailable."}
  ```

- That path emits one fixed diagnostic per failed request:

  ```text
  Device pairing server configuration error: missing MELD_DEVICE_PAIRING_SERVICE_ROLE_KEY
  ```

- The diagnostic does not serialize the thrown error, environment values, the
  request body, the pairing code, or RPC/database details.
- The configuration path does not call `recordPairFailure` or
  `redeemPairingCode`. The regression sends one more request than the per-key
  failure limit and requires every response to remain the sanitized `500`.
- Redemption/RPC failures remain in the existing uniform invalid-code `400`
  handler.

## TDD evidence

### RED

Command:

```text
pnpm --filter @meld/web exec vitest run src/app/api/devices/pair/route.test.ts
```

Before the route change, the new regression failed at the public contract:

```text
FAIL ... > returns a sanitized server error without rate-limiting configuration failures
AssertionError: expected 400 to be 500
Test Files  1 failed (1)
Tests       1 failed | 5 passed (6)
```

This demonstrated that client construction still fell through the broad
redemption catch and returned the invalid-code response.

### GREEN

After separating client construction:

```text
pnpm --filter @meld/web exec vitest run src/app/api/devices/pair/route.test.ts
Test Files  1 passed (1)
Tests       6 passed (6)
```

The regression configures a service-role-key sentinel, submits the real request
pairing code, and inspects the exact response text plus every serialized log
call. Neither value appears. It also proves repeated configuration failures do
not exhaust the per-key failure limit and that redemption is never invoked.
The existing unknown/expired/redeemed test continues to require byte-identical
`400` bodies.

## Documentation corrections

- Replaced the obsolete implementation-plan instruction that said
  `authenticateDevice` ignored `recordDeviceConnection`'s result. The plan now
  states the implemented invariant: WebSocket upgrade authentication rejects
  every non-`active` serialized result, with the revocation-race test retained.
- Corrected the original final-fix report so the earlier full-repository gates
  are explicitly historical evidence for `15c6b8c`, not evidence for the
  combined corrective range.
- Added the canonical device → task → attempt lock-order, deterministic
  deadlock, and independent uncommitted-revocation evidence from `ae42083` and
  `12315b7`.
- Replaced the text-only Keychain rollback overclaim with the stateful
  account→secret evidence from `5005237` and `b5a478f`: mutate-then-throw and
  fulfilled-nonzero faults, empty first-pair cleanup, exact re-pair restoration
  or explicit sanitized incomplete cleanup, and checked exhaustive
  compensation.
- Recorded the configuration-route contract without inventing a
  self-referential commit hash.
- Kept final combined full-repository validation and all three real-Mac
  observations pending. The pre-existing system Supabase CLI
  `realtime.messages` ownership issue remains documented unchanged.

## Validation

```text
pnpm --filter @meld/web exec vitest run src/app/api/devices/pair/route.test.ts
  1 file, 6 tests passed

pnpm --filter @meld/web test
  53 files, 293 tests passed

pnpm --filter @meld/web typecheck
  PASS

pnpm --filter @meld/web lint
  PASS

git diff --check
  PASS
```

The web test suite emitted its existing jsdom canvas/CSS and dependency
sourcemap warnings but exited successfully.

## Files changed

- `apps/web/src/app/api/devices/pair/route.ts`
- `apps/web/src/app/api/devices/pair/route.test.ts`
- `docs/design/plans/2026-07-28-device-pairing-and-persistent-connector.md`
- `.superpowers/sdd/2026-07-28-device-pairing-and-persistent-connector/final-fix-report.md`
- `.superpowers/sdd/2026-07-29-device-pairing-residual-corrections/task-3-report.md`

## Self-review

- Confirmed malformed/schema-invalid inputs are still recorded as failures
  before server-client construction.
- Confirmed client construction occurs only after the request passes parsing
  and schema validation.
- Confirmed the configuration diagnostic is a fixed single string and cannot
  inherit data from the thrown object.
- Confirmed redemption exceptions still record a failure and return the exact
  uniform invalid-code response.
- Confirmed no environment sentinel, request code, RPC detail, or raw request
  body can enter the new response or log contract.
- Confirmed unrelated `supabase/.branches/` and `supabase/.temp/` remain
  untracked and untouched.

## Concerns

None.
