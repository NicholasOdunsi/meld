# Provider Connection Model Design

**Date:** 2026-07-25  
**Status:** Approved for specification review  
**Supersedes:** Provider-connection and provider-gate decisions in the 2026-07-24 MVP design

## 1. Decision

Meld will support both Codex and Claude from the first MVP release. Neither
provider is hidden behind a remote release flag.

Each user connects one or both providers on their own Mac. Meld automatically
installs a private local runtime, the Meld Agent, and the selected official
provider client after explicit confirmation. The provider's official browser
login authenticates the user. Meld never supplies, requests, stores, proxies,
or falls back to an OpenAI or Anthropic API key.

After setup, a per-user macOS LaunchAgent keeps the Meld Agent online without an
open Terminal window. Product Agent mentions and explicit AI actions create
durable tasks that run through the initiating user's selected local provider.

## 2. Product Promise

The connection experience is:

> Connect your Codex or Claude account once. Meld's local agent stays available
> in the background and uses your selected subscription when you explicitly ask
> the Product Agent to participate.

This promise has four boundaries:

1. The initiating user owns the provider connection, device, and usage.
2. Meld pays no model-token costs and performs no silent API-billed fallback.
3. AI execution requires an explicit mention or action.
4. The MVP is content-only. It does not grant the Product Agent access to source
   repositories, arbitrary local files, a shell, or local secrets.

## 3. Connection Experience

### 3.1 Web onboarding

The user opens **Settings → AI connections** and selects **Connect Codex** or
**Connect Claude**. Meld explains:

- what will be installed;
- where it will be installed;
- that the process runs in the background;
- that the user's provider subscription supplies model usage;
- that Meld does not receive provider credentials;
- how to pause, disconnect, and uninstall the local agent.

After confirmation, Meld creates a single-use pairing token that expires after
ten minutes and displays the primary command:

```sh
curl -fsSL https://get.meld.app/agent | sh -s -- --join <one-time-token>
```

For users who already have Node, Meld may also display:

```sh
npx @meld/agent connect --join <one-time-token>
```

Both commands install the same managed artifacts. The `npx` path is an
alternative convenience, not a prerequisite.

### 3.2 Automatic installation

The installer requires no preinstalled Node, npm, npx, Homebrew, Xcode, `sudo`,
or shell-profile changes. It:

1. validates macOS version and architecture;
2. validates the single-use pairing token;
3. shows the selected provider and planned install locations;
4. downloads version-pinned artifacts over HTTPS;
5. verifies published SHA-256 checksums before execution;
6. installs a private Node runtime and Meld Agent under
   `~/Library/Application Support/Meld/`;
7. installs the selected pinned Codex or Claude client in a Meld-owned private
   prefix when a compatible managed copy is absent;
8. creates provider-specific isolated configuration;
9. registers `~/Library/LaunchAgents/com.meld.agent.plist`;
10. starts the background process and hands authentication to the official
    provider client.

Installation is atomic. A failed upgrade preserves the last healthy version.
The installer never modifies the system Node installation, global npm prefix,
Homebrew, `/Library`, `/usr/local`, `/opt/homebrew`, or shell startup files.

### 3.3 Provider authentication

Codex authentication uses the official `codex login` browser flow. Claude
authentication uses the official Claude Code browser login flow. The login
runs visibly so the user can identify the provider and account.

Each provider receives an isolated Meld-owned configuration directory. The user
authenticates that isolated client directly; Meld does not copy credentials from
an existing provider installation. Provider credentials remain in the official
client's supported local credential storage.

Setup completes only after the provider's supported status command confirms an
authenticated session and a harmless content-only smoke test succeeds without
an API-billing credential.

### 3.4 Completion

The installer exits after the LaunchAgent is healthy. The web UI reports:

```text
Codex · Online
Daniel's Mac · Ready for Product Agent tasks
```

or:

```text
Claude · Online
Daniel's Mac · Ready for Product Agent tasks
```

The user may close Terminal. The Meld Agent reconnects after network loss and
starts automatically at the user's next macOS login.

## 4. Runtime Architecture

The architecture has four independently testable units:

### Web application

Creates pairing tokens, displays provider and device state, stores the user's
default provider, allows per-task overrides, and presents recovery actions. It
never receives provider credentials or local executable paths.

### Task broker and gateway

Persists user-owned tasks, validates room and device authorization, notifies the
paired device over an outbound authenticated WebSocket, accepts ordered task
events, and survives either side reconnecting.

### Meld Agent

Runs as a per-user LaunchAgent. It pairs the device, reports provider
capabilities, claims only tasks assigned to its owner, prepares an isolated
temporary content workspace, invokes the chosen adapter, validates output,
streams bounded events, supports cancellation, and deletes temporary task
material.

### Provider adapters

Codex and Claude implement the same internal contract:

```ts
interface ProviderAdapter {
  detect(): Promise<ProviderCapability>;
  authenticate(): Promise<AuthenticationResult>;
  run(
    task: ProductAgentTask,
    signal: AbortSignal,
  ): AsyncIterable<ProviderEvent>;
}
```

Adapters own provider-specific commands, versions, structured-output parsing,
authentication detection, subscription-limit mapping, and safe cancellation.
The task broker and Product Agent workflow do not depend on provider CLI details.

## 5. Task Data Flow

1. A user mentions the Product Agent or invokes an explicit AI action.
2. Meld persists the human message before creating an AI task.
3. The server validates organization membership, room access, initiating user,
   selected provider, and paired-device ownership.
4. The server freezes a room-scoped context manifest and queues the task.
5. The online Meld Agent claims the task. If the device is offline, the task
   remains queued.
6. The Meld Agent revalidates the provider session and task authorization.
7. The adapter starts the exact managed provider binary in an empty,
   Meld-controlled temporary workspace with a minimal environment.
8. Context is passed as content, not as access to Meld's cloud database or the
   user's filesystem.
9. The adapter emits validated progress, text, terminal result, or typed error
   events with monotonically increasing sequence numbers.
10. The gateway acknowledges persisted sequences so reconnects do not duplicate
    content.
11. A successful result becomes a Product Agent message, PRD draft, revision,
    recommendation, or other explicitly requested artifact.
12. The connector deletes temporary task content after terminal acknowledgement.

## 6. Provider Selection

During setup, a user chooses a default provider from their authenticated
connections. An individual task may override the default.

There is no automatic provider switching. If Claude is selected and unavailable,
Meld does not silently run the task through Codex. The user may retry, wait,
cancel, or explicitly select another connected provider.

Codex and Claude are both enabled product capabilities. Normal device,
authentication, version, outage, and compatibility status may make an individual
connection temporarily unavailable; that operational state is not a provider
release flag.

## 7. Security Boundaries

The Meld Agent:

- starts child processes from an explicit empty environment allowlist;
- uses the exact checksum-verified managed binary, never an unresolved `PATH`
  command;
- removes API-key, access-token, cloud-provider, proxy, and unrelated secret
  variables from provider children;
- disables provider tools, MCP servers, plugins, project instructions, skills,
  repository discovery, and shell access where supported;
- rejects unknown tool, file, computer-use, or subprocess events;
- caps output size, turn duration, retry count, and child-process lifetime;
- terminates the complete child process group on cancellation or timeout;
- redacts provider, pairing, room, and attachment content from logs;
- stores its Meld device credential in macOS Keychain;
- never reads, copies, uploads, or logs provider credential files.

If a provider version cannot enforce the content-only boundary, that version is
unsupported until the adapter and compatibility evidence are updated.

## 8. Failure Handling

### Device offline

Keep the task queued and show which device must reconnect. Do not transfer it to
another member.

### Provider signed out

Move the task to **Needs authentication** and offer the official visible login
flow. Resume only after the user completes login and explicitly retries.

### Subscription allowance reached

Preserve the task and show the provider-reported limit. Offer wait, cancel,
retry, or explicit selection of another connected provider. Never offer an
automatic API fallback.

### Unsupported provider version

Pause execution and offer a checksum-verified managed update. Preserve the
previous healthy binary until the new version passes detection and a smoke test.

### Partial or malformed output

Keep validated partial text separately from authoritative output. Offer **Keep
partial draft**, **Retry**, or **Discard**. A malformed result cannot replace a
PRD or post an empty Product Agent message.

### Cancellation or revoked access

Abort the provider process group, stop event acceptance, delete temporary
content, and mark the task terminal. Revalidate room and device access
immediately before execution so queued work cannot bypass a later revocation.

## 9. Provider Policy Position

Meld will enable Codex and Claude in the MVP. The product owner has chosen not to
use a Claude release flag.

Anthropic's June 2026 help update says that Claude Agent SDK, `claude -p`, and
third-party application usage currently continue to draw from subscription
limits:

- https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan

Anthropic's current legal-and-compliance page separately says third-party
developers should use API-key authentication and must not offer Claude.ai login
or route Free, Pro, or Max credentials:

- https://code.claude.com/docs/en/legal-and-compliance

Conductor publicly states that it continues to support Claude subscriptions
while the announced changes are paused:

- https://www.conductor.build/blog/claude-subscription-update

These sources are not fully consistent. The implementation plan must record the
conflict accurately, recheck both primary Anthropic pages before public launch,
and seek clarification from Anthropic. This documentation review is a launch
risk review, not a remote feature flag or an instruction to disable Claude.
Nothing in this design is legal advice.

## 10. Validation

### Installer tests

Test clean machines without Node, machines with Node, Apple Silicon and Intel,
replayed or expired pairing tokens, interrupted downloads, checksum failures,
partial installs, rollback, login restart, pause, update, revoke, and uninstall.

### Adapter contract tests

Use deterministic fake provider processes to verify allowed structured events,
unknown-event rejection, empty or duplicate result rejection, bounded output,
timeout, cancellation, descendant termination, redaction, and removal of
API-billing variables.

### Authenticated provider smoke tests

For each pinned release, verify with controlled subscription accounts:

- visible official browser login;
- authenticated status in the isolated provider home;
- successful non-interactive content-only invocation;
- structured terminal result;
- no tool or filesystem event;
- no sentinel file or secret disclosure;
- no API key or API-billed authentication path;
- correct signed-out, allowance, timeout, and cancellation mapping.

### End-to-end tests

Verify that an explicit Discovery Room mention queues on the initiating user's
device, survives gateway and device restart, runs through the selected provider,
posts exactly one attributed response, and never runs for an ordinary message.

### Usability tests

Observe 5–10 product managers or designers completing automatic installation,
provider login, Terminal closure, first mention, provider override,
reauthentication, and uninstall without engineering assistance.

## 11. Implementation-Plan Consequences

The implementation plan must be revised so that:

1. the provider gate no longer stops all downstream implementation solely
   because the policy documents conflict;
2. both Codex and Claude adapters are MVP deliverables and enabled capabilities;
3. automatic provider installation is part of the one-command onboarding;
4. the universal Node-free bootstrap is primary and `npx` is an alternative;
5. the installed LaunchAgent owns the process after Terminal closes;
6. provider login occurs visibly through the official client;
7. no Claude release flag or “Coming soon” state is introduced;
8. live authenticated smoke tests remain mandatory before public launch;
9. provider-policy evidence is dated, monitored, and rechecked without being
   misrepresented as settled;
10. no platform-funded, API-key, or automatic provider fallback is added.

