# Build mode, part 1 — the build engine and build Stars — design

Date: 2026-11-23 · Status: awaiting owner review

## Read this part first (plain language)

Orion can research, write PRDs and design screens, but it can't write real code yet.
This spec adds that, using the open-source **T3 Code engine** (github.com/pingdotgg/t3code,
MIT licence) instead of writing our own.

**What you'll see:**

1. **Link code to a project.** In a project, choose where its code lives: one of your
   GitHub repos, a folder already on your Mac, or a brand-new GitHub repo Orion creates.
2. **Just ask.** Type "add a login page" in the project chat. Orion decides by itself
   that this is a *build* request (just like it already decides which Star a message
   belongs to). If it isn't sure, it asks with the usual pill.
3. **A build Star appears.** It works on its own copy of the code (its own branch), so
   your main code is never touched while it works. The Star shows what it's doing
   step by step, and the hat sways while it works.
4. **It only asks about risky things.** Normal edits and commands go ahead. Deleting,
   installing or anything outside the project makes it stop and ask. The hat hops,
   and you tap Approve or Decline in the Star.
5. **When it finishes,** the Star shows its reply, the list of files it changed and the
   branch name.
6. **If your Mac is off,** the Star still shows its last status and what changed.
   The full step-by-step detail comes back when the Mac is on.

**How it works, in one picture:**

```
Orion UI (Mac app + web)  →  Orion gateway (online)  →  Connector on your Mac
                                                              ↓
                                               T3 Code engine (hidden, no window)
                                                              ↓
                                     Claude / Codex · Git · your project folders
```

You never install or open T3 Code. The connector downloads a fixed, tested version of
the engine and starts it quietly in the background, the same way it already sets up
Claude and Codex for you.

**Step 0 is a quick test (1–2 days).** Before building anything, we prove the connector
can start the engine, run a build and get its progress back. If that fails, we stop and
switch to the fallback plan: copy the engine's code into our repo and adapt it.

**Not in this part** (each gets its own spec later):
- Part 2: see the full changes, Undo, and one-click GitHub review requests.
- Part 3: run your app, and show it live on the canvas as "Live app" frames.
- Later: terminal, scheduled builds, and applying T3's backend lessons to Orion's own code.

## Decisions already made with the owner

- **Use T3's engine as-is (option A).** Don't copy files and don't rewrite. Fallback is
  copying the engine into our repo (option B), and only if the Step 0 test fails.
- **Keep Orion's UI.** T3's own apps are never used or shown.
- **Code can come from** an existing GitHub repo, a folder on the Mac, or a new GitHub repo
  Orion creates. All three are offered.
- **Orion decides from the message** whether it's a build request. When unsure, it asks.
- **The AI only asks before risky things.** This uses the engine's built-in **Auto** mode,
  which approves routine actions and asks about the rest.
- Coding conversations live in the engine's database on the Mac. Orion keeps a short
  summary online for each build Star.

## Today (what exists)

- **Connector** (`apps/connector`) runs on the Mac, paired with the gateway. It runs
  *content-only* tasks: tools off, an empty temporary folder, JSON replies
  (`providers/claude-adapter.ts`, `security/task-workspace.ts`). It installs fixed,
  checked versions of Node, Claude and Codex (`providers/runtime-installer.ts`,
  `provider-installer.ts`, `release-manifest.ts`). It stores secrets in the Keychain
  (`pairing/keychain-store.ts`).
- **Star routing** (`tasks/star-route-prompt.ts`) returns continue / new / ask.
- **Stars** stream into the native project screen (see
  `2026-11-14-project-stream-and-stars-design.md`, `2026-11-15-star-routing-and-done-rows-design.md`).
- **Hats:** sway = working, hop = needs you (`2026-11-09-orion-overview-and-working-hats-design.md`).

## Technical design (for implementers)

### Step 0 — engine spike (hard gate)

Throwaway branch. It must show each of these working on the owner's Mac, with a written
result in `.superpowers/sdd/2026-11-23-build-mode-engine/spike.md`:

1. Install the latest stable `t3` from npm on spike day (package `t3`, bin `t3`; repo is at
   0.1.11 as of writing) into a connector-owned prefix using the managed Node. Record the
   exact version and integrity in `spike.md`; that becomes the pin.
2. Start it with no window, with `T3CODE_HOME=~/Library/Application Support/Orion/engine`,
   `T3CODE_PORT=<picked>`, `T3CODE_TELEMETRY_ENABLED=false` and `T3CODE_OTEL_SDK_DISABLED=true`.
   It listens on localhost only: no LAN, no T3 Connect.
3. Get a scoped session using `t3 auth session issue`.
4. From a Node script, over the engine's WebSocket RPC (types from `packages/contracts`
   at the pinned commit): create a project on a scratch repo, create a thread in a new
   worktree, set permission mode Auto, send "add a README line", and receive streamed
   events through to turn completion. Read the changed files.
5. Approval round trip: trigger an action that Auto escalates, answer it over RPC and see
   the turn continue.
6. Clone a GitHub repo through the engine, and create a new GitHub repo, using the Mac's
   `gh` sign-in.
7. Point the engine's Claude and Codex at the connector's managed installs and their sign-in
   folders (`providers/<name>/current` + `providers/<name>/home`), so building uses the same
   sign-in as the rest of Orion. Record the exact engine settings that do this.
8. The engine needs Node `^22.16 || ^23.11 || >=24.10`, but the connector's managed Node is
   24.8.0. Try bumping the managed Node to the newest 24.x and re-run the provider smoke
   test. If that breaks anything, give the engine its own Node instead. Record the choice.
9. Record whether the Mac app web view will show an `http://localhost` iframe inside the
   https Orion page. This doesn't block part 1; it is recorded for part 3.

If 4 or 5 can't be done over RPC, try the engine's MCP endpoint (`/mcp`: `create_threads`,
`delegate_task`, `task_status`, …). If neither works, stop and bring option B to the owner.

### Units

| Unit | Where | What it does | Depends on |
|---|---|---|---|
| `EngineInstaller` | `apps/connector/src/engine/engine-installer.ts` | Installs the pinned `t3` (version + integrity in `release-manifest.ts`) into `<connector>/engine/<version>` and verifies it | runtime-installer patterns |
| `EngineProcess` | `engine/engine-process.ts` | Starts and stops the engine with the env from Step 0, picks a free port, restarts it with backoff, stops it when the connector stops, and runs a passive health check that never starts a provider | process-runner |
| `EngineAuth` | `engine/engine-auth.ts` | Issues a fresh engine session with `t3 auth session issue` each time the engine starts and keeps it in memory only. Nothing is stored, because the engine only listens on this Mac | EngineProcess |
| `EngineClient` | `engine/engine-client.ts` | The only code that speaks the engine's RPC. It exposes `linkFolder`, `cloneRepo`, `createRepo`, `startBuild(starId, prompt, model)`, `continueBuild`, `answerApproval`, `cancel` and `subscribe(threadId)`, and translates engine events into Orion `BuildEvent`s | pinned contracts |
| `BuildTaskRunner` | `tasks/build-task.ts` | Handles the new gateway task kinds below. Maps Star ↔ engine thread and throttles events upstream | EngineClient, gateway-client |
| Router change | `tasks/star-route-prompt.ts` + `StarRouteResultSchema` | Adds `intent: "answer" \| "build" \| "unsure"`. `unsure` shows the "Build this?" pill. Routing now also runs when there are no open Stars | contracts |
| Code link UI | web project settings + native Star panel | Picks the code source and shows build status, steps, approvals and changed files | gateway endpoints |

T3's contracts use Effect Schema; ours use zod. Only `EngineClient` imports T3's types, so
nothing else in Orion takes on Effect.

The connector's content-only path is not changed. Build tasks never go through
`task-workspace.ts` or the content adapters.

### New contracts (`packages/contracts`)

- Task kinds: `code_link` (link / clone / create), `build_turn` (start or continue a build
  Star) and `build_approval` (answer).
- `BuildEvent`: `status` (`working | needs_you | done | failed | cancelled`), `step`
  (a short label, at most 1 every 2 s per Star), `reply` (final text), `changed_files`
  (`{path, added, removed}[]`, max 200), `branch`, `approval_request` (`{id, summary,
  choices}`) and `engine_offline`.
- `StarRouteResult` gains `intent` (`answer | build | unsure`, default `answer`). If `intent=build` and the project has no linked code,
  Orion replies with a "Link code" card offering the three choices.

### Database (Supabase)

- `project_code_links`: `project_id`, `kind` (`github | folder | new_github`), `repo_url`
  (nullable), `display_name`, `device_id` and `engine_project_id`. The folder path is
  stored on the Mac only (connector config), not online.
- `build_stars`: `star_task_id`, `engine_thread_id`, `branch`, `status`, `last_step`,
  `changed_files jsonb`, `pending_approval jsonb`, `updated_at`. The Star summary that
  survives the Mac being off lives here.
- Builds run on the device recorded in `project_code_links.device_id`. New GitHub repos are
  created **private**.
- Same RLS pattern as existing Star tables (owner only).

### Flow

1. Message → router → `intent=build` → the gateway queues a `build_turn` for the paired
   device.
2. The connector starts or continues the engine thread. One build Star = one engine thread.
   On start it creates a new worktree + branch `orion/<short-star-title>` (with `-2`, `-3`, …
   added if the name is taken); model = the composer's selected model) and
   subscribes.
3. Engine events → `BuildEvent`s → gateway → `build_stars` and the stream. Hat: `working`
   = sway, `needs_you` = hop.
4. Approve / Decline in the Star → `build_approval` → `EngineClient.answerApproval`.
   No timeout: it waits for you.
5. A follow-up typed inside a build Star → `build_turn` (continue).

### Errors

- Engine won't start or install → the Star fails with "Couldn't start the build engine on
  your Mac". The connector logs the reason, and a retry button re-queues.
- Mac offline → the Star shows its last `build_stars` row plus "Your Mac is offline —
  this build continues when it's back". Queued tasks wait (existing queue behaviour).
- Engine restarts mid-turn → the connector re-subscribes. If the engine reports the turn
  lost, the Star shows `failed` with Retry.
- Provider not signed in → reuse the existing agent-readiness message.

### Testing

- Unit: event translation, throttling, router `intent` parsing and route decisions.
- Integration: run the **real pinned engine** with T3's free `Replay (dev)` provider
  where possible, so tests use real engine behaviour without fake hand-written protocol
  messages.
- E2E: one Playwright flow (link folder → build message → Star done with changed files)
  against the replay provider.
- Live check (owner's Mac, once): a real Claude build on a scratch repo.

### Upgrading the engine

The engine is pinned in `release-manifest.ts`. To upgrade: bump the pin, run the
integration suite against it, then merge. It never updates itself.

### UI

Web uses Astryx components and tokens only (see AGENTS.md). Native uses the existing Star
panel components and the Orion design system. Flat rule: no drop shadows. The "Link code"
card and the approval row reuse the existing pill/card patterns.

## Delivery order

1. Step 0 spike (gate).
2. In parallel: `EngineInstaller` + `EngineProcess` + `EngineAuth` · contracts + database
   migration · router `intent`.
3. `EngineClient` + `BuildTaskRunner`.
4. In parallel: Code link UI (web + native) · build Star UI (steps, approvals, changed files).
5. E2E + live check.
