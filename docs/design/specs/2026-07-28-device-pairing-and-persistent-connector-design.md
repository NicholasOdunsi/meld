# Device Pairing and the Persistent Meld Connector Design

**Date:** 2026-07-28
**Status:** Approved
**Implements:** Task 7 of `docs/design/plans/2026-07-24-personal-ai-product-lifecycle-mvp.md`
**Governed by:** `docs/design/specs/2026-07-25-provider-connection-model-design.md`
**Builds on:** `docs/design/specs/2026-07-28-durable-ai-tasks-and-device-gateway-design.md`

## 1. Decision

Task 6 built a gateway that authenticates devices with a credential no code path
can currently issue: `execution_devices` rows exist only because
`scripts/seed-device.ts` inserts them as the database owner. Task 7 closes that
gap with a pairing flow and a real connector.

A signed-in user generates a short-lived pairing code in the web application and
redeems it from their Mac with one command. Redemption mints a device credential,
stores its hash server-side, and hands the plaintext to the connector exactly
once. The connector keeps that credential in the macOS Keychain, installs itself
as a `launchd` LaunchAgent, and thereafter maintains a gateway connection without
an open Terminal, across logout, crash, and reboot.

Three properties define the feature:

1. **The credential never exists in two places.** The database stores only a
   SHA-256 hash; the connector stores only the plaintext, in the Keychain. No
   file, log, or environment variable holds it.
2. **Pairing is the only unauthenticated write in the system**, and it is
   narrowly scoped: one `security definer` function, executable by `anon`,
   redeeming a single-use code that expires in ten minutes.
3. **A revoked device stops working**, both at connect time and within one
   heartbeat of an already-open session.

## 2. Scope

The MVP plan's Task 7 assumes infrastructure that does not exist: a hosted
`get.meld.app/agent` installer and a published `@meld/agent` npm package. Neither
the domain nor the registry entry exists, so both are removed from this task
rather than stubbed. What remains is the complete functional path, exercised from
the workspace.

| Concern | This task | Deferred to |
| --- | --- | --- |
| Pairing codes, redemption, revocation | Yes | — |
| Connector package, CLI, LaunchAgent, Keychain | Yes | — |
| Onboarding and device-management UI | Yes | — |
| Self-fencing mechanism | Yes, against a stub run | Task 8 supplies the real process |
| `curl \| sh` installer, `get.meld.app` hosting | No | Distribution work |
| Publishing `@meld/agent` to npm | No | Distribution work |
| Provider execution (Codex/Claude adapters) | No | Task 8 |

Consequently the install command shown in the UI is the workspace form:

```sh
pnpm --filter @meld/connector cli -- pair --join ABCD-EFGH
```

The UI copy is written so that swapping this string for the eventual `npx` or
`curl` form is a one-line change, not a redesign.

### 2.1 One package, not two

The MVP plan proposes `apps/connector` plus a separate
`packages/agent-bootstrap` providing the public `@meld/agent` npx entry point.
With no npm publication scheduled, a bootstrap package would exist solely to
forward to a local package — a shim nothing calls. Task 7 ships `apps/connector`
alone. Extracting a thin bootstrap wrapper when publishing is actually scheduled
is mechanical; carrying an empty one now costs a package manifest, a test suite,
and a second thing that can drift.

## 3. Architecture

Four participants.

**`packages/device-auth`** — shared credential primitives. New, extracted from
Task 6 (§4).

**Web application** — issues pairing codes under the user's session, redeems them
under the `anon` role, and manages devices. Holds no service-role credential,
unchanged from Task 6.

**PostgreSQL** — owns code lifecycle, redemption atomicity, and device
revocation, as `security definer` functions. Direct DML stays revoked from every
role, following Task 6 §6.10.

**`apps/connector`** — a Node process. Pairs, stores its credential in the
Keychain, installs a LaunchAgent, and maintains the gateway WebSocket connection
with reconnection and lease self-fencing.

```
apps/connector/src/
  cli.ts                     pair | start | status | uninstall
  agent.ts                   long-running process entrypoint
  config/paths.ts            Meld-owned absolute paths
  pairing/pairing-client.ts  redeem a code, hand the credential to the store
  pairing/keychain-store.ts  /usr/bin/security wrapper behind an interface
  launchd/launch-agent.ts    plist rendering and launchctl lifecycle
  transport/gateway-client.ts  connect, backoff, frame dispatch
  transport/heartbeat.ts     lease renewal and fencing (moved from scripts/)
  run/stub-run.ts            simulated task execution with an abort hook
```

## 4. Shared credential primitives

`mintDeviceCredential`, `hashDeviceSecret`, and `verifyDeviceSecret` currently
live in `apps/gateway/src/auth/device-token.ts`. Task 7 needs the same hashing in
`apps/web`, because the redemption route mints the device credential. One
application importing another application's `src/` is not a workspace boundary
that should exist, so the module moves to a new package.

`packages/device-auth` exports:

- `hashToken(value)` — SHA-256 hex, the single hashing implementation for both
  device secrets and pairing codes.
- `verifyToken(value, digest)` — constant-time, returning `false` rather than
  throwing on a malformed digest.
- `mintDeviceCredential(deviceId)` — 32 random bytes, base64url, returning
  `{ credential, tokenHash }`.
- `parseDeviceAuthorization(header)` — unchanged, gateway-only consumer.
- `mintPairingCode()` — eight Crockford Base32 characters (§5.1), returning
  `{ code, codeHash }`.
- `normalizePairingCode(input)` — uppercases, strips separators and whitespace,
  and maps the visually ambiguous `I`/`L` → `1` and `O` → `0`, so a user retyping
  a code from the screen cannot fail on transcription alone. `U` is *not* mapped:
  Crockford defines no substitution for it, so a `U` simply produces a hash that
  matches nothing and fails as an invalid code.

`apps/gateway`, `apps/web`, and `scripts/seed-device.ts` import from here.
Existing gateway tests move with the module. This is a pure extraction: no
behaviour changes, which is what makes it safe to do inside a feature task.

## 5. Data Model

Migration `supabase/migrations/202607280002_device_pairing.sql`.

### 5.1 `device_pairing_codes`

`id`, `user_id` → `auth.users`, `code_hash` (unique), `requested_provider`
(`provider` enum), `expires_at`, `redeemed_at`, `redeemed_device_id` →
`execution_devices`, `created_at`.

Codes are eight Crockford Base32 characters — the alphabet excludes `I`, `L`,
`O`, and `U`, so no two characters are confusable when read aloud or retyped, and
`U` is omitted to avoid accidental obscenities. That is 32⁸ ≈ 1.1 × 10¹²
possibilities against a ten-minute window (§10).

Only the hash is stored. A pairing code is a bearer credential for the duration
of its life, and the row is readable by anyone who can read the table.

`requested_provider` is recorded at creation because the user chooses their
provider in the web UI, before the connector exists. Redemption returns it so the
connector knows which provider to report on first connect.

### 5.2 Additions to `execution_devices`

No columns change. Task 6 revoked all direct DML on the table, and did not add a
revocation path for `authenticated`, so the device-management UI has nothing to
call. §6.3 adds one function.

## 6. Database Functions

| Function | Caller | Behaviour |
| --- | --- | --- |
| `create_device_pairing_code(code_hash, requested_provider)` | `authenticated` | §6.1 |
| `redeem_device_pairing_code(code_hash, device_id, token_hash, platform, name)` | `anon` | §6.2 |
| `revoke_execution_device(device_id)` | `authenticated` | §6.3 |
| `list_execution_devices()` | `authenticated` | §6.4 |

All follow the Task 6 §6.10 convention: `security definer`, `set search_path =
''`, fully schema-qualified identifiers, `revoke all ... from public`, then one
explicit grant.

The migration additionally **alters Task 6's `record_device_connection`** to
return the device's `status`, which §10.1 needs to close a revoked device's open
socket. Its signature and existing behaviour are otherwise unchanged.

### 6.1 `create_device_pairing_code`

Derives `user_id := auth.uid()` rather than accepting it. Inserts with
`expires_at = now() + interval '10 minutes'`.

Before inserting it deletes the caller's expired and redeemed codes, and rejects
the request if the caller already holds five live codes. Both bounds exist
because the table is writable by any signed-in user; without them a script could
grow it without limit, and every live code is an additional guessable target
(§10).

### 6.2 `redeem_device_pairing_code`

This is the only `anon`-executable function in the schema. The connector has no
Supabase session — pairing *is* the credential bootstrap — so no narrower grant
is available.

In one transaction:

1. `select ... for update` the code by `code_hash`.
2. Reject when missing, `expires_at <= now()`, or `redeemed_at is not null`. All
   three raise the same `invalid_pairing_code` (§10).
3. Insert the `execution_devices` row with the caller-supplied `device_id`,
   `token_hash`, `platform`, and `name`, `user_id` taken from the code, and
   `status = 'active'`.
4. Stamp `redeemed_at` and `redeemed_device_id`.
5. Return `(user_id, requested_provider)`.

Steps 3 and 4 commit together. A code can therefore never be spent without
producing a device, and a device can never exist without a spent code.

Redemption deliberately does **not** create a `provider_connections` row. That
still arrives with the connector's first `provider.status` frame, through Task
6's `upsert_provider_connections`. A device that paired but never started
therefore reports no provider, and Task 6 §6.1 step 5 correctly refuses to create
tasks for it — pairing alone is not evidence that a provider is installed.

### 6.3 `revoke_execution_device`

Asserts `auth.uid() = user_id`, sets `status = 'revoked'` and `revoked_at`.
Idempotent: revoking a revoked device succeeds without changing `revoked_at`.

Revocation does not cancel that device's in-flight tasks. Task 6 already recovers
them: the connector's leases stop being renewed once its socket closes (§6.5), so
each attempt reaps into `waiting_for_device` or `needs_review` on its own.

### 6.4 `list_execution_devices`

Returns the caller's devices with their provider connections for the management
UI. A function rather than a select-with-RLS because it joins
`provider_connections` and must not expose another user's rows through that join.

## 7. Web API

### 7.1 `POST /api/devices/pairing-codes`

Authenticated. Body `{ requestedProvider }`. Mints a code with
`mintPairingCode()`, calls `create_device_pairing_code` with the hash, and
returns `{ code, expiresAt }`. The plaintext code exists only in this response.

### 7.2 `POST /api/devices/pair`

Unauthenticated. Body `{ code, platform, name }`.

1. Rate-limit check (§10).
2. `normalizePairingCode` then `hashToken`.
3. `mintDeviceCredential(randomUUID())`.
4. Call `redeem_device_pairing_code` through the **anon** client — the web tier
   still holds no service-role key.
5. Return `{ deviceId, deviceToken, requestedProvider }`.

The plaintext token is returned once and never persisted by the web tier.

### 7.3 `POST /api/devices/[deviceId]/revoke`

Authenticated, calls `revoke_execution_device`.

## 8. Web UI

Two surfaces, built with Astryx components and the Neutral theme, consistent with
the rest of the application.

**`connect-device.tsx`** — the onboarding flow. The user picks **Codex** or
**Claude** (both available; no release flag, allowlist, or "coming soon"
treatment, per the governing design). On selection the page requests a code and
renders it alongside a copyable command block, a countdown to expiry, and a
**Generate a new code** action once it lapses.

Before the user runs anything, the page states plainly: where the connector
installs, that it runs in the background and restarts at login, that the
credential is stored in the Keychain, that provider login happens separately in
the provider's own tool, and how to pause or remove it. It also states what is
*not* required — no Xcode, no Homebrew, no `sudo`, no open Terminal after setup.

**`device-list.tsx`** — the management surface. Each device shows its name,
platform, connector version, last-seen time, provider connection status, and a
**Revoke** action behind a confirmation that names the consequence: the device
stops running tasks and must be paired again.

Neither page polls for connector arrival in this task. Live connection status
belongs with the room UI work in Task 10, which introduces the subscription
machinery; adding a bespoke poller here would be replaced by it.

## 9. Connector

### 9.1 Paths

Everything under `~/Library/Application Support/Meld/`:

| Path | Contents |
| --- | --- |
| `connector/current/` | the installed bundle |
| `config.json` | gateway URL, `deviceId`, `requestedProvider` — no secrets |
| `logs/agent.log` | stdout and stderr from the LaunchAgent |

The plist is written to `~/Library/LaunchAgents/com.meld.agent.plist`.

`connectorPaths(home)` takes the home directory as an argument so tests assert
exact strings without touching the real filesystem.

### 9.2 LaunchAgent

The MVP plan's plist references a Meld-managed Node at
`runtime/current/bin/node`. That runtime only exists if we ship the hosted
installer, which §2 removes. Instead:

- `cli pair` **copies** the built bundle into `connector/current/` rather than
  pointing at the workspace. A LaunchAgent aimed at a working tree breaks
  silently when the branch changes or `dist/` is cleaned; a copy does not.
- The plist's program arguments are `process.execPath` — the Node that ran the
  install — and the copied `agent.mjs`.
- `RunAtLoad` and `KeepAlive` are both true, so the agent starts at login and
  restarts on crash.
- `StandardOutPath` and `StandardErrorPath` point at `logs/agent.log`.
- The plist contains no `/usr/local` or `/opt/homebrew` path.

`launchctl` is invoked through an injected command runner, so plist rendering and
lifecycle logic are testable on Linux CI.

### 9.3 Keychain

`KeychainStore` wraps `/usr/bin/security` — `add-generic-password -U`,
`find-generic-password -w`, `delete-generic-password` — with service
`com.meld.agent` and account `deviceId`.

The `security` CLI rather than `keytar` or another native module: native bindings
need `node-gyp` or prebuilds, which would make the connector unbuildable on a
machine without a toolchain and reintroduce the Xcode dependency the onboarding
copy promises is unnecessary.

`KeychainStore` is an interface with an in-memory implementation for tests. No
test touches the real Keychain.

### 9.4 Pairing client

`PairingClient.pair(code)` resolves to `{ deviceId, requestedProvider }` — never
the token. The token goes directly from the HTTP response into the credential
store, so no caller can log it by accident.

Before redeeming, it **probes Keychain writability** by writing and deleting a
throwaway entry. Redemption spends a single-use code; discovering afterwards that
the credential cannot be stored would leave an orphaned device row and a burned
code. Probing first turns that into a clean pre-flight failure.

### 9.5 Gateway client

Takes a credential store rather than reaching for the Keychain itself, and
connects with `Authorization: Device <deviceId>.<secret>`. The agent injects
`KeychainStore`; tests and the §12.6 integration harness inject the in-memory
implementation, which is what lets the end-to-end test run on a Linux CI runner
that has no Keychain.

- Reconnects with exponential backoff and jitter, 1s doubling to a 30s cap.
- **`401` is terminal.** The device was revoked or its credential is invalid, and
  no amount of retrying changes that. The agent logs `re-pair required` and
  exits, rather than letting `KeepAlive` thrash against a permanent rejection.
- All other failures — refused connection, closed socket, network loss — retry
  indefinitely, because the gateway being down is expected and temporary.

### 9.6 Heartbeat and self-fencing

`scripts/fake-connector-heartbeat.ts` already implements the required
coordinator: it tracks active `(taskId, attemptId)` leases, sends them on the
30-second heartbeat, compares `heartbeat.ack.renewedTasks` against what it sent,
and fires `onLeaseOmitted` for any lease the server did not renew. That is
precisely the self-fencing signal the gateway design §1.1 and §6.7 place on this
task.

Rather than reimplement it, the module **moves** to
`apps/connector/src/transport/heartbeat.ts`, and `scripts/fake-connector.ts`
imports it from there. Same reasoning as §4: one implementation, two consumers.

`onLeaseOmitted` aborts the run. In this task the run is `run/stub-run.ts` — a
simulated execution emitting `progress` and `text.delta` events with a real abort
hook. Task 8 replaces the stub with a provider child process group; the abort
contract does not change.

### 9.7 CLI

| Command | Behaviour |
| --- | --- |
| `pair --join CODE` | pre-flight the bundle and Keychain, redeem, store credential, write config, copy bundle, install and load the LaunchAgent |
| `start` | run the agent in the foreground — the escape hatch when LaunchAgent installation fails, and the form used by tests |
| `status` | print device ID, provider, gateway URL, LaunchAgent loaded state, and last log lines; never the credential |
| `uninstall` | boot out and remove the LaunchAgent, delete the Keychain entry, clear Application Support |

`uninstall` is local only. The connector holds no Supabase session, so it cannot
revoke its own device server-side; it finishes by telling the user to revoke the
device in the web UI, and names it.

## 10. Security

`POST /api/devices/pair` is the only unauthenticated write in the system, and a
successful guess yields a device that can execute AI tasks against a stranger's
rooms and spend their provider allowance. Four controls:

**Uniform failure.** Unknown, expired, and already-redeemed codes return
byte-identical `400` responses. Distinguishing them would let an attacker confirm
which guesses hit a real code, and the user-facing cost of merging them is nil:
the remedy in every case is to generate a new code.

**Rate limiting.** Ten failed attempts per IP and two hundred globally, each over
a rolling ten minutes — one window's worth of live codes — with `429` beyond
them. Successful redemptions do not count, so a user retrying a mistyped code is
never locked out by their own success. The arithmetic already favours us — 32⁸ codes, at most five live per user, a
ten-minute window — but a limit is what makes a distributed guessing attempt
expensive rather than merely unlikely, and it bounds abuse of an open endpoint.

The limiter is in-process. This matches the single-instance constraint the
gateway design §9.4 already accepts and documents, and like that constraint it is
a deployment obligation (§12), not a correctness one: the ceiling degrades
per-instance under horizontal scaling, it does not disappear.

**Anon role, not service role.** Redemption runs through the anon client against
one narrowly-scoped `security definer` function. The web tier gains no new
privilege.

**No plaintext at rest.** The database holds SHA-256 hashes of both the pairing
code and the device secret. The plaintext code appears only in the creation
response; the plaintext token only in the redemption response and thereafter the
Keychain. Neither is written to `config.json`, a log, or an environment variable
at any level.

### 10.1 Revocation reaches connected devices

Task 6 authenticates only at socket upgrade, so a device revoked mid-session
keeps a working connection until it happens to disconnect. Closing this needs a
liveness check the gateway already performs: `record_device_connection` is called
on every heartbeat, so it returns the device's status, and the gateway closes the
socket on `revoked`.

Bounded by the 30-second heartbeat rather than instant. Re-checking on every
frame would put a database round trip in the path of every `text.delta`, and the
exposure being closed — a revoked device continuing work it had already been
authorized to start — does not warrant it.

### 10.2 Residual risks

**`security` argv exposure.** The device secret is passed as a command-line
argument to `/usr/bin/security`, where it is visible in `ps` for the duration of
that process. Accepted: it is the user's own credential on the user's own
machine, and the alternative is a native module (§9.3) whose build requirements
contradict the product promise. Recorded here rather than left implicit.

**No connector code signing.** The bundle is copied and executed unsigned. Any
process already able to write to `~/Library/Application Support/Meld/` can
replace it. That process could equally read the Keychain entry, so signing would
not change the boundary — but it does mean the connector offers no defence
against a compromised user account, and it is distribution work (§2) regardless.

## 11. Error Handling

| Condition | Response |
| --- | --- |
| Unknown, expired, or redeemed code | Uniform `400 invalid_pairing_code` |
| Rate limit exceeded | `429` |
| Six live codes for one user | `400`, with copy directing the user to the code already on screen |
| Keychain not writable | Pre-flight failure before redemption (§9.4); code unspent |
| Keychain write fails after redemption | Explicit message naming the orphaned `deviceId` and directing the user to revoke it |
| `cli pair` run before the connector is built | Pre-flight failure naming the build command; nothing is redeemed |
| LaunchAgent install fails | Clear error; pairing already succeeded and `cli start` still works in the foreground |
| Gateway unreachable | Backoff with jitter, indefinitely |
| `401` at connect | Terminal; logs `re-pair required` and exits (§9.5) |
| Device revoked mid-session | Socket closed within one heartbeat (§10.1) |
| Lease not renewed | Run aborted through `onLeaseOmitted` (§9.6) |
| `uninstall` with no install present | Succeeds; each step is individually idempotent |

## 12. Testing

### 12.1 `packages/device-auth` unit

Task 6's `device-token.test.ts` moves here intact, extended for pairing codes:
the Crockford alphabet excludes `I`, `L`, `O`, and `U`; `normalizePairingCode`
maps `abcd-efgh`, `ABCD EFGH`, and `abcdefgh` to one value and folds `I`/`L` → `1`
and `O` → `0`; verification stays constant-time and returns `false` rather than
throwing on malformed digests.

### 12.2 pgTAP — `supabase/tests/device_pairing.test.sql`

`create_device_pairing_code` derives `user_id` from `auth.uid()` and ignores any
attempt to supply one; the five-live-code ceiling; expiry is ten minutes.
`redeem_device_pairing_code` rejects unknown, expired, and already-redeemed codes
with the same error; a successful redemption both marks the code and creates the
device, and neither is observable without the other; the created device belongs
to the code's user, not the caller. `anon` can execute
`redeem_device_pairing_code` and no other function. `authenticated` and
`service_role` are both denied direct DML on `device_pairing_codes`.
`revoke_execution_device` refuses another user's device and is idempotent.

### 12.3 Web route tests

`pairing-codes` requires a session and returns the plaintext code exactly once.
`pair` returns byte-identical bodies and statuses for unknown, expired, and
redeemed codes; enforces the rate limit; returns the device token exactly once;
and never logs it.

### 12.4 Connector unit

`security` and `launchctl` sit behind injected interfaces, so the whole suite
runs on the existing Ubuntu CI runners:

- `connectorPaths` produces exact absolute paths under Application Support.
- `renderLaunchAgent` emits `RunAtLoad`, `KeepAlive`, the copied bundle path, the
  recorded Node path, and no `/usr/local` or `/opt/homebrew` string.
- `PairingClient` stores the token and resolves without it; the writability probe
  runs before redemption, and a probe failure means no redemption call is made.
- `KeychainStore` round-trips through a fake command runner and surfaces
  `security` failure exit codes as errors.
- `GatewayClient` backs off with jitter, caps at 30s, and treats `401` as
  terminal.
- The heartbeat coordinator fires `onLeaseOmitted` for exactly the leases missing
  from `renewedTasks`.

### 12.5 Gateway

One addition to Task 6's suite: a heartbeat from a revoked device closes the
socket (§10.1).

### 12.6 Integration

Extends the existing `gateway-integration` CI job: create a pairing code, redeem
it through the route, connect a `GatewayClient` in-process with the returned
credential, and drive one stub task to completion. This is the test that proves
pairing produces a credential the Task 6 gateway actually accepts — every other
layer verifies its own half of that contract in isolation.

### 12.7 Playwright

This task ships the first UI in the project, and the applicable lesson from
earlier work is that typecheck, unit tests, and build all pass on server-runtime
errors that only a browser surfaces. The onboarding flow (select provider → code
renders → command is copyable → expiry state appears) and the device list
(revoke updates the row) therefore get real browser coverage.

Following the established pattern, a `MELD_E2E_FAKE_DEVICES` gate lets these
specs run against fakes in the `e2e` job, consistent with
`MELD_E2E_FAKE_WORKSPACES` and `MELD_E2E_FAKE_DISCOVERY`.

### 12.8 Manual checklist

Three properties no CI runner can prove, because the runners have no macOS
Keychain and no `launchd`. Recorded as explicit steps:

1. `cli pair` writes a real Keychain entry, visible in Keychain Access under
   `com.meld.agent`.
2. The agent keeps running and stays connected after the Terminal window that
   started it is closed.
3. The agent reconnects on its own after a reboot, with no user action.

## 13. Interface Obligations on Later Tasks

- **Task 8** — replace `run/stub-run.ts` with real provider execution, honouring
  the existing abort hook so lease loss aborts the provider child process group
  (§9.6).
- **Task 10** — live connection and task status in the room UI; §8 deliberately
  ships no poller for it.
- **Distribution** — hosting `get.meld.app/agent`, publishing `@meld/agent`,
  extracting the bootstrap wrapper (§2.1), signing the bundle (§10.2), and
  replacing the in-process rate limiter for multi-instance deployment (§10).

## 14. Out of Scope

- **Hosted installer and npm publication** — §2.
- **Provider execution and adapters** — Task 8.
- **Room UI for task status** — Task 10.
- **Pairing from a device the user is not signed in on** — the code is generated
  in an authenticated session by design; QR or email-delivered codes are not
  required by the MVP.
- **Windows and Linux connectors** — the Keychain and LaunchAgent layers are
  macOS-specific. Both sit behind interfaces, so a port replaces two modules
  rather than restructuring the package, but no port is attempted here.
