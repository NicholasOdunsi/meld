# Device pairing and persistent connector final fix report

Date: 2026-07-29

Reviewed base: `3183cfc`

Original final-fix implementation commit: `15c6b8c`

Residual corrective commits:

- `ae42083`, `12315b7`: canonical SQL lock ordering and
  mutation-sensitive concurrency evidence.
- `5005237`, `b5a478f`: stateful, checked Keychain compensation.
- Pairing-route configuration handling: corrected in the Task 3 change that
  updates this report; no self-referential commit hash is claimed here.

## Outcome

The original eight blocking findings in `final-fix-brief.md` were addressed in
`15c6b8c`. A later scoped review identified residual proof and failure-boundary
gaps. The corrective commits listed above add canonical database lock ordering,
mutation-sensitive live concurrency evidence, stateful Keychain rollback
evidence, and a distinct server-configuration response for the public pairing
route.

Focused validation for the SQL and Keychain corrections is complete. Focused
route validation is recorded below after the Task 3 change. Final
full-repository validation of the combined corrective range remains pending.
Real Codex/Claude execution and distribution remain later scope. The three
real-Mac observations remain explicitly pending and `CON-11` remains
unchecked.

## Findings to commit mapping

| Finding | Resolution | Commit |
| --- | --- | --- |
| 1. Enforce revocation server-side | Upgrade authentication rejects every non-`active` serialized connection result; task mutation RPCs use canonical device → task → attempt locking with deterministic multi-row ordering. A deterministic three-connection test catches the former renew/append deadlock, and independent live sessions prove heartbeat and renewal wait for an uncommitted revoke, observe its committed state, and leave durable task/device state unchanged. The gateway watchdog and heartbeat fencing remain covered. | `15c6b8c`, `ae42083`, `12315b7` |
| 2. Make pairing limits authoritative | Redemption execute privilege moved from `anon` to `service_role`; the public route uses a dedicated `server-only`, non-persistent client. Missing service-role configuration now has a separate sanitized `500` path that neither invokes redemption nor consumes a pairing failure; invalid and redemption failures retain the uniform `400`. Issuance takes a per-user transaction advisory lock; a 12-connection live concurrency test proves exactly five successful live codes. | `15c6b8c`; Task 3 corrective change |
| 3. Stop launchd terminal-auth thrash | The plist uses `KeepAlive.SuccessfulExit = false`; missing credentials and gateway `401` report terminal authentication through a callback; the agent emits `Meld connector stopped: re-pair required.` and exits cleanly. | `15c6b8c` |
| 4. Make uninstall stop-first | Uninstall proves bootout/absence before any destructive cleanup. A stop-stage failure returns retry instructions and preserves the credential, config, bundle, plist, and Application Support root; successful cleanup retains idempotence and the web-revoke reminder. | `15c6b8c` |
| 5. Remove the previous Keychain credential on re-pair | A stateful account→secret fake proves the actual post-failure store state for both mutate-then-throw and fulfilled-nonzero faults. First-pair cleanup leaves no index or secret; re-pair either restores the previous index/secret exactly or returns an explicit sanitized incomplete-cleanup error. Every compensation result is checked and all compensations are attempted even after an earlier failure; tokens, runner output, and causes remain redacted. | `15c6b8c`, `5005237`, `b5a478f` |
| 6. Bind the selected provider truthfully | The persisted `requestedProvider` reaches `GatewayClient`; capability/status frames contain only the chosen Codex or Claude provider. Unit and live integration cases cover both selections without claiming real provider execution. | `15c6b8c` |
| 7. Make revoked UI state durable | `list_execution_devices` returns active, non-revoked devices only. pgTAP proves revoked devices do not reappear after reload. Confirmation copy describes next-heartbeat fencing and lease non-renewal rather than promising immediate termination. | `15c6b8c` |
| 8. Close test/documentation gaps | Orphan-save errors are tested against sentinel token/cause leakage; connector integration uses the scheduled heartbeat path; `status` tails the last 20 log lines without reading credentials; checklist claims were narrowed, plan whitespace removed, and the design/plan updated. | `15c6b8c` |

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
    1 file, 6 tests passed
  pnpm --filter @meld/web test
    53 files, 293 tests passed
  pnpm --filter @meld/web typecheck
  pnpm --filter @meld/web lint
```

The Task 3 route checks are also recorded by the corrective task report. The
final combined `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, pgTAP,
gateway integration, connector integration, and Playwright rerun is still
pending.

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
