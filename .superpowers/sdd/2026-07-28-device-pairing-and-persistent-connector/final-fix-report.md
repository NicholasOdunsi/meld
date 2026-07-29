# Device pairing and persistent connector final fix report

Date: 2026-07-29

Reviewed base: `3183cfc`

Final implementation commit: `15c6b8c`

## Outcome

All eight blocking findings in `final-fix-brief.md` are addressed in
`15c6b8c`. The approved architecture changes are reflected in the design,
implementation plan, environment examples, CI, and product checklist.

The automated pairing slice is complete and validated. Real Codex/Claude
execution and distribution remain later scope. The three real-Mac observations
remain explicitly pending and `CON-11` remains unchecked.

## Findings to commit mapping

| Finding | Resolution | Commit |
| --- | --- | --- |
| 1. Enforce revocation server-side | Upgrade authentication consumes the recorded active status; heartbeat/revoke is serialized with device row locks; task mutation RPCs recheck an active device; a gateway-owned watchdog closes and removes sessions after two missed heartbeat intervals; live revocation closes with `1008 device_revoked`. | `15c6b8c` |
| 2. Make pairing limits authoritative | Redemption execute privilege moved from `anon` to `service_role`; the public route uses a dedicated `server-only`, non-persistent client and named configuration failure; issuance takes a per-user transaction advisory lock; a 12-connection live concurrency test proves exactly five successful live codes. | `15c6b8c` |
| 3. Stop launchd terminal-auth thrash | The plist uses `KeepAlive.SuccessfulExit = false`; missing credentials and gateway `401` report terminal authentication through a callback; the agent emits `Meld connector stopped: re-pair required.` and exits cleanly. | `15c6b8c` |
| 4. Make uninstall stop-first | Uninstall proves bootout/absence before any destructive cleanup. A stop-stage failure returns retry instructions and preserves the credential, config, bundle, plist, and Application Support root; successful cleanup retains idempotence and the web-revoke reminder. | `15c6b8c` |
| 5. Remove the previous Keychain credential on re-pair | The recovery index identifies the prior account; save switches the index and removes a different prior device secret. Compensating rollback restores the old account/index and removes the new secret at every command boundary. Errors redact tokens and command causes. | `15c6b8c` |
| 6. Bind the selected provider truthfully | The persisted `requestedProvider` reaches `GatewayClient`; capability/status frames contain only the chosen Codex or Claude provider. Unit and live integration cases cover both selections without claiming real provider execution. | `15c6b8c` |
| 7. Make revoked UI state durable | `list_execution_devices` returns active, non-revoked devices only. pgTAP proves revoked devices do not reappear after reload. Confirmation copy describes next-heartbeat fencing and lease non-renewal rather than promising immediate termination. | `15c6b8c` |
| 8. Close test/documentation gaps | Orphan-save errors are tested against sentinel token/cause leakage; connector integration uses the scheduled heartbeat path; `status` tails the last 20 log lines without reading credentials; checklist claims were narrowed, plan whitespace removed, and the design/plan updated. | `15c6b8c` |

## Validation evidence

### Full repository gates

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
