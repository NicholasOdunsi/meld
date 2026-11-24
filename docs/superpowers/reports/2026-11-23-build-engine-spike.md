# Build engine spike: results (2026-11-23)

## In plain language

The test passed. T3 Code's server ran hidden on this Mac with no browser and no window, and listened
only to this machine. A small script drove it the way Orion's connector will. The script made a
project, started a Claude build in a separate copy of the repo, watched it finish, and read back the
change. The real repo stayed untouched. The script also said "no" to an approval prompt, then "yes" to
a second one, and both answers worked. It stopped a running turn, cloned two GitHub repos, and
published a new private repo. Claude also ran from Orion's own install and sign-in.

Three things need a decision:

1. **Auto mode didn't ask for approval.** In Auto mode, Claude ran `npm install left-pad` without
   asking. Approval prompts only appeared in Supervised mode (`approval-required`).
2. **Orion's installed Claude and Codex are too old for this engine.** The engine marks Codex 0.146.0
   as **broken** (it needs 0.159.0 or newer). It marks Claude 2.1.220 as **limited** (it wants 2.1.301
   or newer). Claude still finished a build.
3. **The test GitHub repo is still there.** The sign-in can't delete repos. The owner needs to delete
   `NicholasOdunsi/orion-spike-test-87db` (see Cleanup).

Source used for wire shapes: the git tag `v0.1.11` of github.com/pingdotgg/t3code (commit `59651c17`),
cloned to `.context/t3code-src/t3code-0.1.11`. Every payload below was sent to a running 0.1.11
engine. The fixtures under `apps/connector/src/engine/fixtures/` record the actual frames.

## Engine pin

- npm package: `t3`
- version: `0.1.11`
- integrity: `sha512-LwGw1MBUrKJfqjTl/75QpAPbD3TBoyyPA8NgNrQh0yb0cQHGzoOBYuHcZa17rRcbLAULGCf9Bn/9ntEYUmxlLw==`
- engines: `{"node": ">=20.11"}`. This differs from the plan's assumption of `^22.16 || ^23.11 || >=24.10`.

The npm package is only a launcher, `bin/t3.mjs`. On first run it downloads
`t3-0.1.11-darwin-arm64.tar.gz` from the GitHub release. It checks the archive against the release's
`SHA256SUMS`, then unpacks it to `$T3CODE_HOME/runtime/versions/0.1.11/`. The archive holds a
166 MB **Node 26.13.1 single-executable binary** (`t3`), plus `client/` and `node_modules/`. The
launcher then spawns that binary and forwards SIGTERM/SIGHUP to it.

**Trap:** the launcher downloads into `T3CODE_HOME`, which defaults to `~/.t3`. That includes
`t3 --version`. Every call, even `--version`, must have `T3CODE_HOME` set. If it isn't, the 400 MB
runtime lands in `~/.t3`. (This happened once during the spike, in Step 2, which ran before the export
in Step 3. `~/.t3` did not exist beforehand. The runtime was moved into the scratch home and `~/.t3`
was removed.)

## Node choice

**Keep managed Node 24.8.0. A separate engine Node isn't needed.**

- The only part that uses Orion's Node is the launcher (`engines >=20.11`). The spike's second engine
  run used the managed `~/Library/Application Support/Meld/runtime/current/bin/node` (24.8.0) to run
  the launcher. It worked.
- The engine itself runs inside its own bundled Node 26.13.1. Orion's Node version doesn't matter to it.
- Optional bump, if wanted: `24.22.3`, the newest 24.x.
  - darwin-arm64: `https://nodejs.org/dist/v24.22.3/node-v24.22.3-darwin-arm64.tar.gz`, sha256
    `ff6e17d4874b76d272212b908cc020d6e815fba5a6c7eaaa06add725840307fd` (the download matched this)
  - darwin-x64: `https://nodejs.org/dist/v24.22.3/node-v24.22.3-darwin-x64.tar.gz`, sha256
    `977614af0504c81045e7fd85596dbca0e5f951b96681516dadafedcca8c447f7`
  - With `RELEASES.node` set to these values temporarily, `bash scripts/provider-adapters/smoke-test.sh --self-test` →
    `provider adapter self-test PASS` (on Node 24.22.3).
  - `vitest run` of release-manifest, runtime-installer and provider-setup tests: 73 passed, 5 failed.
    All 5 failures are hard-coded `24.8.0` checks in those tests, not behaviour. A bump would update them.
  - The manifest edit was reverted.
- Option: skip the npm launcher entirely. Download and check the release tarball directly, then run
  `runtime/versions/<v>/t3`. That needs no Orion Node at all.

## Transport

**`rpc`**: an Effect RPC WebSocket with JSON serialization. MCP wasn't needed (Step 8 skipped).

Connection sequence:

1. Mint a ticket: `POST http://127.0.0.1:38917/api/auth/websocket-ticket` with headers
   `Authorization: Bearer <session token>` and `content-type: application/json`, and body `{}`.
   The reply is `{"ticket":"…","expiresAt":"<now+5min>"}`. A ticket is short-lived and used only to
   open the socket.
2. Open the socket:
   `ws://127.0.0.1:38917/ws?wsTicket=<ticket>&orchestrationProtocol=2&clientCapabilities=settingsSecretReferences`.
   `orchestrationProtocol` must equal the descriptor's `orchestrationProtocolVersion` (2).
3. Frames are JSON text. (The official client also sets `socketFrameParts=1`, which allows split
   frames. The spike left it out and it wasn't needed.)
   - Request: `{"_tag":"Request","id":<n>,"tag":"<method>","payload":{…},"traceId":"…","spanId":"…","sampled":true,"headers":[]}`.
     `id` is a JSON number that counts up per socket. The spike sent `traceId`/`spanId`/`sampled`
     because the Effect client adds them. Nobody tested whether the server needs them. A hand-written
     client should send them, using random hex.
   - Unary reply: `{"_tag":"Exit","requestId":<n>,"exit":{"_tag":"Success","value":…}}`. A failure is
     `{"_tag":"Failure","cause":…}`.
   - Stream reply: repeated `{"_tag":"Chunk","requestId":<n>,"values":[…]}`. **After each Chunk the
     client sends `{"_tag":"Ack","requestId":<n>}`**, because streams wait for the ack.
   - Ending a stream from the client: `{"_tag":"Interrupt","requestId":<n>}`.
   - Keepalive: the client sends `{"_tag":"Ping"}` every 5 s and the server replies `{"_tag":"Pong"}`.
     The official client drops the socket after 15 s with no frame. Ping and Pong frames aren't
     recorded in the fixtures.

## Session

```bash
T3CODE_HOME=<engine home> t3 auth session issue \
  --scope orchestration:read --scope orchestration:operate --scope source-control:write \
  --ttl 1d --label orion-connector --subject orion-connector --json
```

This works while the server runs: it writes to the same database. Output shape (token redacted):

```json
{
  "sessionId": "fa563adf-4b80-4776-8191-9c9d9d38ab01",
  "token": "[redacted]",
  "method": "bearer-access-token",
  "scopes": ["orchestration:read", "orchestration:operate", "source-control:write"],
  "subject": "orion-connector",
  "client": { "label": "orion-connector", "deviceType": "bot" },
  "expiresAt": "2026-11-24T21:18:02.417Z"
}
```

`--token-only` prints just the token. These three scopes covered every call in this report:
projects, threads, messages, approvals, stop, diff, clone and publish. Git work and worktrees run as
part of orchestration, so no separate git scope exists. The scope list was chosen to leave out
`terminal:*`. Provider wiring through RPC (`server.updateSettings`) would also need `settings:write`
and `providers:manage`. The spike configured providers through `settings.json` instead, so neither
scope was needed. `GET /api/auth/session` with the bearer echoes the grant
(`"permissions":["orchestration:read","orchestration:operate","source-control:write"]`).

**Secret on stdout:** `t3 serve` prints a one-time pairing token, a pairing URL and a QR code to
stdout. The connector must treat the engine's stdout as secret, or discard it.

## Health check

Start command, run in the foreground from the connector's own process. Capture its PID. Stop it with
SIGTERM to that PID, and the launcher forwards it to the binary.

```bash
T3CODE_HOME=<engine home> T3CODE_PORT=38917 T3CODE_TELEMETRY_ENABLED=false T3CODE_OTEL_SDK_DISABLED=true \
  t3 serve --host 127.0.0.1 --port 38917 --no-browser
```

- `lsof -nP -iTCP:38917 -sTCP:LISTEN` → a single socket, `TCP 127.0.0.1:38917 (LISTEN)`, owned by the
  `t3` binary. Nothing on `::1` and nothing on a wildcard address.
- Ready line on stdout: `T3 Code server is ready.`. The log line before it is `Listening on http://127.0.0.1:38917`.
- **Health check:** `GET http://127.0.0.1:38917/.well-known/t3/environment` returns 200 with no
  auth. Body: `environmentId`, `label`, `platform`, `serverVersion: "0.1.11"`,
  `orchestrationProtocolVersion: 2`, `databaseMigration: 102`, `capabilities{…}`. The call starts no
  provider session. The connector should check `serverVersion` and `orchestrationProtocolVersion`.
- An authenticated liveness check is the RPC `server.probe` with payload `{}`, which needs
  `orchestration:read`.
- Note: on startup the server checks every enabled provider by itself: version, auth and usage
  limits. It spawns each CLI briefly whatever health check you use. To stop this, disable unused
  providers in `settings.json` (`providerInstances.<id>.enabled: false`).
- SIGTERM shutdown took under 1 s. No child processes were left behind. A small provider-watchdog
  `sh` belonging to the engine exited by itself within about 10 s.

## Provider wiring

Write this to `$T3CODE_HOME/userdata/settings.json` **before** starting the engine. The server also
watches the file for changes. `M` stands for `~/Library/Application Support/Meld`:

```json
{
  "providerInstances": {
    "claudeAgent": {
      "driver": "claudeAgent",
      "config": {
        "binaryPath": "<M>/providers/claude/current/node_modules/.bin/claude",
        "homePath": "<M>/providers/claude/home"
      }
    },
    "codex": {
      "driver": "codex",
      "config": {
        "binaryPath": "<M>/providers/codex/current/node_modules/.bin/codex",
        "homePath": "<M>/providers/codex/home"
      }
    }
  }
}
```

- Claude `homePath` becomes `CLAUDE_CONFIG_DIR`. `HOME` and the keychain stay as they are. The
  spike confirmed this in the process environment of the spawned Claude. Codex `homePath` becomes `CODEX_HOME`.
- The instance ids `claudeAgent` and `codex` are the built-in defaults. In model selection use
  `{"instanceId":"claudeAgent","model":"claude-haiku-4-5"}`.
- After the restart, `server.getConfig` reported:
  - Claude: `version 2.1.220`, `continuation.groupKey: "claude:home:<M>/providers/claude/home"`,
    auth `Claude Pro Subscription`, status `ready`. **compatibilityAdvisory `graceful`**: "limited
    compatibility … Use >=2.1.301".
  - Codex: `version 0.146.0`, groupKey `codex:home:<M>/providers/codex/home`, auth `ChatGPT Plus
    Subscription`, status `ready`. **compatibilityAdvisory `broken`**: "known to be incompatible
    with this T3 Code release. Use >=0.159.0." No Codex turn was attempted.
- Step 5 re-run on managed Claude: a fresh thread produced `+hello from Orion` in its own worktree.
  The spawned process was `<M>/providers/claude/current/node_modules/.bin/claude` with
  `CLAUDE_CONFIG_DIR=<M>/providers/claude/home`.
- Without a `settings.json`, the engine used whatever `claude` and `codex` it found on the login-shell
  PATH (on this Mac, Conductor's copies) and `~/.claude` / `~/.codex`. **The engine rebuilds PATH for
  providers from the user's login shell.** Limiting the engine's own PATH didn't change the provider's
  PATH, so explicit `binaryPath` values are what pin the CLI.
- The managed Codex `bin/codex` starts with `#!/usr/bin/env node`. It will run under whichever `node`
  comes first on the login-shell PATH, not under Orion's managed Node. If that matters, point
  `binaryPath` at a wrapper that runs managed Node.
- Side effects in the managed Claude home: Claude 2.1.220 rewrote `.claude.json` (2.3 KB to 87 KB).
  It also created `sessions/` and `.last-cleanup`, plus a `projects/<worktree>` transcript. The spike
  deleted the transcript. A shared home means Orion's chat and the engine share Claude's local state.

## Payloads

All of these went over the RPC socket and succeeded against 0.1.11. IDs are client-generated UUIDs;
any non-empty string is accepted. Each payload is the `payload` of a Request frame whose `tag` is the
method name.

### Create a project (before the first launch)

`projects.mutate` (scope `orchestration:operate`):

```json
{"type":"project.create","commandId":"<uuid>","projectId":"<uuid>","title":"scratch-repo","workspaceRoot":"/abs/path/to/repo"}
```

The reply is the `Project`, whose `id` equals `projectId`. Optional fields:
`createWorkspaceRootIfMissing`, `defaultModelSelection`, `scripts`.

### Launch thread in a new worktree with Auto mode

`orchestration.launchThread`:

```json
{
  "commandId": "<uuid>",
  "threadId": "<uuid>",
  "projectId": "<projectId>",
  "title": "Orion spike build",
  "generateTitle": false,
  "modelSelection": { "instanceId": "claudeAgent", "model": "claude-haiku-4-5" },
  "runtimeMode": "auto",
  "interactionMode": "default",
  "workspaceStrategy": { "type": "worktree", "baseRef": "main" },
  "initialMessage": { "text": "Add a line 'hello from Orion' to README.md. Do nothing else.", "attachments": [] }
}
```

- The reply is `{threadId, projection, resumed}`. Right after launch, `projection.thread.worktreePath`
  is `null`. Once the worktree is prepared it becomes
  `$T3CODE_HOME/worktrees/<repo>/t3-<hash>`, on a branch the engine names itself, such as
  `t3/add-hello-from-orion`. Read it with `orchestration.getThreadProjection {"threadId"}` or from
  `thread.updated` events. `workspaceStrategy.branch` sets the name if needed.
- `runtimeMode` takes one of `approval-required` (Supervised), `auto-accept-edits`, `auto` or
  `full-access`.
- Result: README.md changed only in the worktree. The main checkout of `scratch-repo` stayed clean,
  and the edit wasn't committed in the worktree.

### Send a message

`orchestration.dispatchCommand`:

```json
{"type":"message.dispatch","createdBy":"user","creationSource":"web","commandId":"<uuid>","threadId":"<threadId>","messageId":"<uuid>","text":"…","attachments":[],"dispatchMode":{"type":"start_immediately"}}
```

`createdBy` and `creationSource` are **required**. Allowed `creationSource` values: `web`, `mobile`,
`mcp`, `provider`, `server`. The reply is `{"sequence":<n>}`. To queue behind an active run, use
`dispatchMode` `{"type":"queue_after_active"}`. To steer the active run, use
`{"type":"steer_active","targetRunId":…}`.

### Subscribe to a thread

`orchestration.subscribeThread` (a stream):

```json
{"threadId":"<threadId>"}
```

The first Chunk is `{"kind":"snapshot","snapshotSequence","projection":{thread,runs,runtimeRequests,messages,turnItems,…}}`.
After it come `{"kind":"event","sequence","event":{type,payload,…}}` items and `{"kind":"synchronized"}`.
These event types matter for Orion:

- `run.created` / `run.updated`: `payload.status` moves through `starting`, `running` and `waiting`,
  then ends at one of the final states `completed`, `failed`, `cancelled`, `interrupted` or
  `rolled_back`. The run "settles" when it reaches one of them.
- `runtime-request.updated`: an approval. `payload.kind` is `command`, `file-change`, etc.
  `payload.status` is `pending` and later `resolved`, and `payload.id` is the `requestId`.
- `turn-item.updated` with `payload.type == "approval_request"`: carries `prompt` (for example
  `"npm install left-pad@1.2.0"`), `reason`, `requestKind` and `requestId`. This is the item to show
  the user.
- `message.updated` with `role:"assistant"`: the agent's text.

You can resume with `afterSequence: <snapshotSequence or last sequence>`.

### Read changed files

`orchestration.getTurnDiff` `{"threadId":"<threadId>","fromTurnCount":0,"toTurnCount":1}` → `{…,"diff":"diff --git a/README.md b/README.md …"}`.
Turn counts are per-thread checkpoint ordinals (before the first turn = 0). `orchestration.getFullThreadDiff` also exists.

### Answer an approval

`orchestration.dispatchCommand`:

```json
{"type":"runtime-request.respond","commandId":"<uuid>","threadId":"<threadId>","requestId":"<runtime-request id>","decision":"decline"}
```

Allowed `decision` values: `accept`, `acceptForSession`, `acceptAlways`, `decline` and `cancel`.
Claude requests also accept `feedback` (text sent back to the agent).

- **Auto mode didn't escalate.** With `runtimeMode:"auto"`, Haiku ran `npm install left-pad` twice
  without a `runtime-request`, because Claude's own automatic review approved it.
- With Supervised mode on, a `command` request appeared for each attempt.
  - `decline` → the request resolved with `decision:"decline"`, the node `cancelled`, and the agent
    replied "Refused. Stopping." The worktree wasn't inspected between the two runs. Before this test it held no `package.json`, and the accept run created one.
  - `accept` → the request resolved, the command ran, `package.json` gained `left-pad ^1.2.0`, and the
    run completed.
- Supervised mode was set on the live thread with:

```json
{"type":"thread.runtime-mode.set","commandId":"<uuid>","threadId":"<threadId>","runtimeMode":"approval-required"}
```

### Stop a turn

`orchestration.dispatchCommand`:

```json
{"type":"run.interrupt","commandId":"<uuid>","threadId":"<threadId>","runId":"<run id from run.updated>","reason":"Stopped from Orion"}
```

The run went to `interrupted` within the same second. Run ids look like
`run:thread:<threadId>:ordinal:<n>`. There's also `{"type":"thread.stop","commandId","threadId"}`,
which stops the whole thread and its delegated tasks. The spike didn't run it.

### Clone a repo

Project flow: `projectClone.start` (scope `source-control:write`). It returns once cloning starts.

```json
{"projectId":"<uuid>","title":"Hello-World","createdAt":"<ISO now>","provider":"github","repository":"octocat/Hello-World","destinationPath":"/abs/dest/Hello-World"}
```

→ `{projectId,cwd,remoteUrl:"git@github.com:octocat/Hello-World.git",repository:{nameWithOwner,url,sshUrl}}`.
To follow progress, call `subscribeProjectClones` with `{}`. It streams arrays of
`{projectId,phase:"running"|"done"|"failed"|"cancelled",stage,percent,…}`. Hello-World reached
`phase:"done"` in about 3 s. This flow picked **SSH** by default. Pass `"protocol":"https"` when the Mac
has no SSH key for GitHub.

Plain clone with no project: `sourceControl.cloneRepository`
`{"provider":"github","repository":"octocat/Spoon-Knife","destinationPath":"/abs/dest/Spoon-Knife"}` →
`{cwd,remoteUrl:"https://github.com/octocat/Spoon-Knife",repository}`. This one used HTTPS.

### Publish a new private repo

`sourceControl.publishRepository`:

```json
{"cwd":"/abs/path/local-repo-with-a-commit","provider":"github","repository":"orion-spike-test-87db","visibility":"private"}
```

→ `{"repository":{"nameWithOwner":"NicholasOdunsi/orion-spike-test-87db",…},"remoteName":"origin","remoteUrl":"https://github.com/NicholasOdunsi/orion-spike-test-87db","branch":"main","status":"pushed"}`.
`gh repo view` confirmed `"visibility":"PRIVATE"`. Authentication came from the Mac's `gh` sign-in.

## Canvas follow-up (2026-11-24)

A standalone WKWebView probe on this Mac used Orion's App Transport Security settings.
It checked both the request received by the child server and a JavaScript message from
the loaded iframe. The HTTPS test parent was served on loopback with a certificate pinned
by the probe.

| Parent | Child iframe | Result |
| --- | --- | --- |
| HTTP loopback | HTTP localhost | Server received the request and the iframe replied |
| HTTPS loopback | HTTPS loopback | Server received the request and the iframe replied |
| HTTPS loopback | HTTP localhost or HTTP 127.0.0.1 | No child request or reply for either address |

The Orion Preview app also requested a localhost HTTP page from a temporary sample
frame in the HTTP demo canvas. The child server returned HTTP 200. This confirmed
the local request path. The desktop accessibility check timed out, so the test did
not verify visual rendering. The temporary app and canvas edits were removed from
the test run.

The existing canvas design frame also sets `frame-src 'none'`, which blocks nested
frames. All 18 existing frame-document and frame-host tests passed.
Part 3 needs a separate live preview path that works from an HTTPS canvas. The canvas
check is independent of the engine gate for Plan A.

## Connector implementation check

The connector installed the reviewed T3 0.1.11 launcher in an isolated scratch home
with managed Node 24.8.0. The real launcher reports `t3 v0.1.11`. A second call reused
the install. The connector started the engine on `127.0.0.1`, checked the release
and protocol in the health descriptor, issued a session, and authenticated a request.
After stop, connecting to the same port returned `ECONNREFUSED`.

The managed installer downloaded and verified the updated pins for Claude (2.1.331)
and Codex (0.171.0) in the scratch home. The provider adapter self-test passed. This
check covered installation and CLI version verification. Live inference with those
pins remains an integration acceptance check.

## Build Star integration checks

- On a separate local Supabase stack, a clean migration reset passed all 1,407
  pgTAP assertions. The Build mode cases covered authorized linking, replay-safe
  task creation, lease fencing, approval authorization, and persisted settlement.
- A replay crossed the real gateway WebSocket and connector. It linked a
  scratch checkout, submitted a message as a room editor, replayed recorded T3
  events, and verified the changed-files summary after the device disconnected.
- A live Codex turn against T3 0.1.11 requested approval for a single file write.
  After the runner approved that specific scratch change, the turn completed
  and reported the new file. The starting Git checkout stayed clean. A second
  run verified a public GitHub clone and code link.
- The Claude turn reached T3 and its CLI replied that it needed a login. The
  private GitHub publishing action was covered by the RPC tests. No new private
  repository was published during this integration check.
- The web component and Mac tests passed. The full Chromium room flow did not
  complete in the isolated stack. Next.js exceeded the navigation deadline on
  the room route, and the isolated Supabase API timed out during the retry.

## Not done / pending

- **Step 8 (MCP fallback):** not needed, because RPC worked for Steps 5 and 6. For reference, `/mcp`
  accepts only OAuth sessions with subject `mcp-client`, and it refuses bearer sessions from
  `auth session issue` (per `docs/internals/environment-auth.md`).
- **Step 11 (canvas iframe in the Mac app):** The demo app request and standalone
  HTTPS probe are recorded above. Visual verification in Orion remains open.
- **Codex turn:** not run, because the engine marks managed Codex 0.146.0 as `broken`.

## Cleanup

- The engine was stopped by its captured PID, and `~/orion-spike` was removed. `~/.t3` doesn't exist.
- The spike-created Claude transcript folders were removed from `~/.claude/projects/` and from the
  managed Claude home.
- **Still open:** the private repo `NicholasOdunsi/orion-spike-test-87db` wasn't deleted.
  `gh repo delete` returned `HTTP 403 … needs the "delete_repo" scope`, and auth was not changed. To
  remove it, run `gh auth refresh -h github.com -s delete_repo` and then
  `gh repo delete --yes NicholasOdunsi/orion-spike-test-87db`, or delete it on github.com.

## Fixtures

`apps/connector/src/engine/fixtures/`. Each file has one JSON object per line:
`{seq,t,dir,frame}`. `dir` is `http-request`, `http-response`, `ws-open`, `send`, `recv` or `ws-close`.
Tokens, tickets and Authorization values are `"[redacted]"`. Ping and Pong frames are left out.

- `build-turn.jsonl`: project create, launch (auto, worktree), subscribe until settled, thread projection, turn diff
- `approval.jsonl`: two Auto attempts (no approval), then Supervised: decline round trip, accept round trip
- `stop-turn.jsonl`: message, then `run.interrupt` → `interrupted`
- `clone.jsonl`: `projectClone.start` + `subscribeProjectClones`, `sourceControl.cloneRepository`, `sourceControl.publishRepository`
