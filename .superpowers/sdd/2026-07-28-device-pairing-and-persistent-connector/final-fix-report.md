# Device pairing and persistent connector final fix report

Date: 2026-07-29

Reviewed base: `3183cfc`

Original final-fix implementation commit: `15c6b8c`

Residual corrective commits:

- `ae42083`, `12315b7`: canonical SQL lock ordering and
  mutation-sensitive concurrency evidence.
- `5005237`, `b5a478f`: stateful, checked Keychain compensation.
- `89e94e6`, `3031fda`: distinct pairing-route configuration handling and
  secret-safe diagnostic classification.
- `a62e03f`: self-contained relocated connector artifact and ambiguous probe
  cleanup.
- `b49fb97`, `feeb834`: quota-specific pairing-code recovery and
  mutation-sensitive UI state evidence.

## Outcome

The original eight blocking findings in `final-fix-brief.md` were addressed in
`15c6b8c`. A later scoped review identified residual proof and failure-boundary
gaps. The corrective commits listed above add canonical database lock ordering,
mutation-sensitive live concurrency evidence, stateful Keychain rollback
evidence, and a distinct server-configuration response for the public pairing
route.

Focused validation for every correction and final full-repository validation
of the combined corrective range through `feeb834` are complete. Real
Codex/Claude execution and distribution remain later scope. The three real-Mac
observations remain explicitly pending and `CON-11` remains unchecked.

## Findings to commit mapping

| Finding | Resolution | Commit |
| --- | --- | --- |
| 1. Enforce revocation server-side | Upgrade authentication rejects every non-`active` serialized connection result; task mutation RPCs use canonical device → task → attempt locking with deterministic multi-row ordering. A deterministic three-connection test catches the former renew/append deadlock, and independent live sessions prove heartbeat and renewal wait for an uncommitted revoke, observe its committed state, and leave durable task/device state unchanged. The gateway watchdog and heartbeat fencing remain covered. | `15c6b8c`, `ae42083`, `12315b7` |
| 2. Make pairing limits authoritative | Redemption execute privilege moved from `anon` to `service_role`; the public route uses a dedicated `server-only`, non-persistent client. Missing server configuration now has a separate sanitized `500` path that neither invokes redemption nor consumes a pairing failure; exact allowlisting identifies either missing public URL or service-role variable without logging raw errors, while unknown construction failures use a fixed generic diagnostic. Invalid and redemption failures retain the uniform `400`. Issuance takes a per-user transaction advisory lock; a 12-connection live concurrency test proves exactly five successful live codes. | `15c6b8c`, `89e94e6`, `3031fda` |
| 3. Stop launchd terminal-auth thrash | The plist uses `KeepAlive.SuccessfulExit = false`; missing credentials and gateway `401` report terminal authentication through a callback; the agent emits `Meld connector stopped: re-pair required.` and exits cleanly. | `15c6b8c` |
| 4. Make uninstall stop-first | Uninstall proves bootout/absence before any destructive cleanup. A stop-stage failure returns retry instructions and preserves the credential, config, bundle, plist, and Application Support root; successful cleanup retains idempotence and the web-revoke reminder. | `15c6b8c` |
| 5. Remove the previous Keychain credential on re-pair | A stateful account→secret fake proves the actual post-failure store state for both mutate-then-throw and fulfilled-nonzero faults. First-pair cleanup leaves no index or secret; re-pair either restores the previous index/secret exactly or returns an explicit sanitized incomplete-cleanup error. Every compensation result is checked and all compensations are attempted even after an earlier failure; tokens, runner output, and causes remain redacted. | `15c6b8c`, `5005237`, `b5a478f` |
| 6. Bind the selected provider truthfully | The persisted `requestedProvider` reaches `GatewayClient`; capability/status frames contain only the chosen Codex or Claude provider. Unit and live integration cases cover both selections without claiming real provider execution. | `15c6b8c` |
| 7. Make revoked UI state durable | `list_execution_devices` returns active, non-revoked devices only. pgTAP proves revoked devices do not reappear after reload. Confirmation copy describes next-heartbeat fencing and lease non-renewal rather than promising immediate termination. | `15c6b8c` |
| 8. Close test/documentation gaps | Orphan-save errors are tested against sentinel token/cause leakage; connector integration uses the scheduled heartbeat path; `status` tails the last 20 log lines without reading credentials; checklist claims were narrowed, plan whitespace removed, and the design/plan updated. | `15c6b8c` |

## Post-validation whole-branch findings

A fresh whole-branch review at `7342c63` found two Important issues and one
Minor after the earlier automated validation:

| Finding | Resolution | Commit |
| --- | --- | --- |
| Installed LaunchAgent artifact retained workspace runtime imports | `zod` and `ws` are bundled into the Node 20 ESM artifact with `createRequire` interop for bundled `ws`. The normal connector test now builds, copies only `agent.mjs` outside the repository, launches it with an empty temporary home, rejects bare non-Node imports and `ERR_MODULE_NOT_FOUND`, and requires the expected application configuration diagnostic. | `a62e03f` |
| Pairing-code quota cleared the only visible usable code and returned generic `409` | Only typed `too_many_pairing_codes` returns the design's explicit `400` guidance. The UI preserves code, expiry, terminal command, and minting provider as one snapshot across quota/generic failures and provider switches, replacing it only after a validated latest success. Tests cover malformed success and stale success/failure ordering. | `b49fb97`, `feeb834` |
| Ambiguous Keychain probe writes could leave probe accounts | Probe cleanup now targets the exact generated account after thrown, nonzero, or successful writes. Stateful tests cover mutate-then-throw, nonzero-after-mutation, and cleanup failure while preserving the boolean, secret-safe contract. | `a62e03f` |

## Validation evidence

### Focused residual-correction gates

The following focused gates have passed after the residual corrections:

```text
Canonical SQL and revocation:
  pnpm test:sql
  pnpm dlx supabase@2.109.1 test db
    6 files, 383 tests passed
  pnpm --filter @meld/gateway test
    9 files, 79 tests passed
  pnpm --filter @meld/connector test:integration
    1 file, 7 tests passed
  pnpm --filter @meld/connector typecheck
  pnpm --filter @meld/connector lint -- src/pairing/pairing-client.integration.test.ts

Keychain compensation:
  pnpm --filter @meld/connector exec vitest run src/pairing/keychain-store.test.ts
    1 file, 30 tests passed
  pnpm --filter @meld/connector exec vitest run src/pairing
    3 files, 41 tests passed
  pnpm --filter @meld/connector test
    13 files, 93 tests passed
  pnpm --filter @meld/connector typecheck
  pnpm --filter @meld/connector lint

Pairing-route configuration:
  pnpm --filter @meld/web exec vitest run src/app/api/devices/pair/route.test.ts
    1 file, 8 tests passed
  pnpm --filter @meld/web test
    53 files, 295 tests passed
  pnpm --filter @meld/web typecheck
  pnpm --filter @meld/web lint
```

The Task 3 route checks are also recorded by the corrective task report.

### Combined corrective-range final gates (`feeb834`)

These commands validate the complete combined range after all scoped reviews
and fix rounds:

```text
$ pnpm test
Astryx convention tests: 8 passed
Colocation script tests: 12 passed
Repository colocation: 78 test files sit beside their module
Provider adapter self-test: PASS
SQL enum/arity/discovery static checks: PASS
@meld/contracts: 1 file, 28 tests passed
@meld/device-auth: 2 files, 8 tests passed
@meld/gateway: 9 files, 79 tests passed
@meld/connector: 13 files, 96 tests passed
Relocated production agent bundle smoke: PASS
@meld/web: 53 files, 302 tests passed
Turbo: 5 successful, 5 total
Exit: 0

$ pnpm typecheck
Turbo: 5 successful, 5 total
Exit: 0

$ pnpm lint
Turbo: 5 successful, 5 total
Exit: 0

$ pnpm build
Gateway tsup: success
Connector tsup: success
Next.js production build: compiled successfully
Turbo: 3 successful, 3 total
Exit: 0

$ pnpm dlx supabase@2.109.1 test db
Files=6, Tests=383
Result: PASS

$ pnpm --filter @meld/gateway test:integration
Test Files  2 passed (2)
Tests       14 passed (14)

$ pnpm --filter @meld/connector test:integration
Test Files  1 passed (1)
Tests       7 passed (7)

$ NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=e2e-placeholder-key \
  MELD_DEVICE_PAIRING_SERVICE_ROLE_KEY=e2e-placeholder-server-key \
  pnpm exec playwright test --trace off
4 passed (1.0m)
Exit: 0
```

The live integration commands were run with the local Supabase database URL,
API URL, publishable key, and service-role key exported under the names their
fixtures require. Initial invocations without the full local environment
stopped at the fixtures' required-variable guards; the complete-environment
reruns above are the behavioral results.

The first Playwright run at the final source head passed three tests, then
failed while Playwright attempted to write an artifact ZIP after the host
volume reached `ENOSPC`; no application assertion failed. Generated `.next`,
`dist`, and `test-results` outputs were removed. A complete rerun with trace
recording disabled passed all four browser tests. Generated outputs were
removed again afterward; no source or Supabase runtime metadata was removed.

### Original full repository gates (`15c6b8c`)

These full-repository results predate the residual corrective commits and are
retained as historical evidence; they are not presented as validation of the
combined corrective range.

```text
$ pnpm test
Astryx convention tests: 8 passed
Colocation script tests: 12 passed
Repository colocation: 78 test files sit beside their module
Provider adapter self-test: PASS
SQL enum/arity/discovery static checks: PASS
@meld/contracts: 1 file, 28 tests passed
@meld/device-auth: 2 files, 8 tests passed
@meld/gateway: 9 files, 79 tests passed
@meld/connector: 13 files, 87 tests passed
@meld/web: 53 files, 293 tests passed
Turbo: 5 successful, 5 total
Exit: 0

$ pnpm typecheck
Turbo: 5 successful, 5 total
Exit: 0

$ pnpm lint
Turbo: 5 successful, 5 total
Exit: 0

$ pnpm build
Gateway tsup: success
Connector tsup: success
Next.js production build: compiled successfully
Turbo: 3 successful, 3 total
Exit: 0
```

The first full `pnpm test` run exposed one copy assertion after replacing the
incorrect “immediately” claim. The dialog was corrected to retain the explicit
running-task consequence while describing heartbeat/lease timing; the complete
gate above is the clean rerun.

### PostgreSQL and live integrations

The repository's system Supabase CLI is `2.110.0`. Its literal
`supabase db reset` still stops in the pre-existing discovery migration:

```text
Applying migration 202607240004_discovery.sql...
ERROR: must be owner of table messages (SQLSTATE 42501)
At statement: 88
alter table realtime.messages enable row level security
```

This final fix does not claim that unrelated ownership problem is resolved.
Using the project-pinned `2.109.1` CLI, all migrations applied and the relevant
database and live integration evidence passed:

```text
$ pnpm dlx supabase@2.109.1 test db
Files=6, Tests=372
Result: PASS

$ pnpm --filter @meld/gateway test:integration
Test Files  2 passed (2)
Tests       14 passed (14)

$ pnpm --filter @meld/connector test:integration
Test Files  1 passed (1)
Tests       5 passed (5)
Duration    11.24s
```

The connector live suite includes:

- twelve independent PostgreSQL clients issuing codes concurrently, with
  exactly five successes and a final live-code count of five;
- a real scheduled one-second heartbeat observing `1008 device_revoked`;
- live selected-provider publication for both Codex and Claude;
- a paired credential driving the stub task to completion.

The disposable local stack was stopped with:

```text
$ pnpm dlx supabase@2.109.1 stop --no-backup
Stopping containers...
Stopped supabase local development setup.
```

`supabase/.branches/` and `supabase/.temp/` were preserved and remain untracked.

### Browser validation

The bare local Playwright invocation lacked the two pre-existing public
Supabase placeholder variables, so its readiness probe could not construct the
Supabase client and was stopped before test execution. Re-running with the same
placeholder environment used by CI produced:

```text
$ NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=e2e-placeholder-key \
  MELD_DEVICE_PAIRING_SERVICE_ROLE_KEY=e2e-placeholder-server-key \
  pnpm exec playwright test
4 passed (31.7s)
Exit: 0
```

The service-role value above is a non-secret E2E placeholder; no request reaches
Supabase under the fake-device/workspace/discovery gates.

## Residual concerns and later scope

- The in-process public pairing rate limiter remains a documented
  single-instance deployment constraint.
- Real provider child-process execution, hosted installation, publication,
  checksum verification, and bundle signing remain outside this task.
- The full optional local Supabase stack encountered the host's existing
  Colima/vector bind-mount issue. A minimal stack excluding optional services
  was sufficient for pgTAP and both live integrations.
- The system CLI's unrelated `realtime.messages` ownership failure remains as
  recorded above.

## Pending manual acceptance

No automated suite or Linux runner can close these observations:

- [ ] Pairing through the CLI creates a visible `com.meld.agent` entry in
  Keychain Access.
- [ ] After closing Terminal, `launchctl list | grep com.meld.agent` still
  shows the agent and the gateway still reports the device connected.
- [ ] After reboot, the agent reconnects without user action.
