# Build mode Part B implementation plan

**Goal.** Link code to an Orion project, then run a Supervised Build Star from chat and persist its outcome so the Mac can go offline.

**Architecture.** Orion owns project authorization, the task lease and the Star summary. The paired Mac owns filesystem paths and starts the pinned T3 release on demand. T3 owns the project checkout, thread, worktree, provider process and checkpoints.

**Tech stack.** TypeScript and Zod, existing connector and gateway WebSockets, Supabase Postgres and pgTAP, Astryx web components, Swift AppKit and SwiftUI, Vitest and Playwright.

## Constraints

- Use T3 0.1.11 and orchestration protocol 2 from [the spike](../reports/2026-11-23-build-engine-spike.md). Use the recorded frames in `apps/connector/src/engine/fixtures` as test inputs.
- Use `approval-required` for every newly launched Build Star. Show only Approve and Decline, mapped to T3 `accept` and `decline`.
- Run on the device stored on the code link. Reuse the selected managed Claude or Codex account and model. Preserve the ordinary content task executor's command isolation.
- Keep working directories, engine credentials and internal runtime paths on the Mac. Store only repo display metadata, sanitized build events, opaque identifiers and the build summary online.
- Use `MAX_BUILD_CHANGED_FILES` (200) and `BUILD_STEP_MIN_INTERVAL_MS` (2,000). Build events and settlements must also satisfy the existing serialized task-event and result bounds.
- Create new GitHub repositories private. Publication in acceptance tests uses a disposable private repo with separately authorized deletion access. Use replay or a public clone for routine tests.
- The first vertical slice is a local folder link through the actual composer, with an existing repository on a paired Mac. Linking by GitHub and the native folder picker follow the same contract.
- Keep the full diff, Undo, review requests, dev server and canvas Live App frames in their later slices.

### Task 1. Implement the local engine client

**Files.** Create `apps/connector/src/engine/engine-client.ts` and `engine-client.test.ts`. Use the current `EngineProcess` and its injectable fetch and connection dependencies. Translate T3 data at this boundary.

- [ ] Test the ticket exchange and a recorded request, unary result, stream chunk, acknowledgement, stop and disconnect. Rewrite only the request IDs in fixture replay. Assert that mismatched IDs never settle a pending call and malformed frames close the socket with a safe diagnostic.
- [ ] Open a ticketed socket. POST `{}` to `/api/auth/websocket-ticket` with the in-memory bearer. Construct `/ws?wsTicket=…&orchestrationProtocol=2&clientCapabilities=settingsSecretReferences` with URL APIs. Send the Effect `Request` envelope with a per-connection numeric ID, random trace/span IDs and empty headers. Demultiplex `Exit` and `Chunk`; ACK after accepting the chunk and send `Interrupt` on early stream return. Ping every five seconds and close after 15 seconds without a frame. Bound in-flight work and reject every pending waiter on close.
- [ ] Wrap the recorded methods. `projects.mutate` registers a local project. `projectClone.start` and `subscribeProjectClones` track the clone by project ID. `sourceControl.publishRepository` receives `visibility: "private"`. The long-lived client reconnects with a newly minted ticket. Before a ticket is requested with an expired session, issue a fresh local session and retry once. Tests exercise a rejected ticket and a silent socket.

```ts
type EngineApproval = "accept" | "decline";
type BuildModel = { instanceId: "claudeAgent" | "codex"; model: string };

// Inputs use stable Orion-generated UUIDs so retries address the same resources.
type StartBuild = {
  commandId: string;
  threadId: string;
  projectId: string;
  title: string;
  branch: string;
  baseRef: string;
  modelSelection: BuildModel;
  prompt: string;
};
```

- [ ] Implement `startBuild(input: StartBuild)` via `orchestration.launchThread`, with `generateTitle: false`, `runtimeMode: "approval-required"`, `interactionMode: "default"` and `workspaceStrategy: { type: "worktree", baseRef, branch }`. For continuation submit `message.dispatch` with a stable message ID and `queue_after_active`. Map approvals via `runtime-request.respond`; interrupt the exact current run using `run.interrupt`. Expose `subscribeThread(threadId, afterSequence?)`, `getThreadProjection(threadId)` and `getTurnDiff(threadId, fromTurnCount, toTurnCount)`.
- [ ] Run `pnpm --filter @meld/connector exec vitest run src/engine`. Against the real pinned engine, verify version, ticket exchange and read-only `server.probe` before running any coding flow.

### Task 2. Carry build jobs through the existing task lease

**Files.** Extend `packages/contracts/src/{build,ws,ai}.ts`, `apps/connector/src/transport/gateway-client.ts`, and `apps/gateway/src/{ws/protocol-handler,tasks/task-repository}.ts` where required by the message routing. Add a Supabase migration and pgTAP tests beside `build_mode.test.sql`.

- [ ] Define strict per-kind inputs and results. Use the existing `task.payload`, `task.event`, `task.complete` and cancellation messages so retry/resume use the existing attempt identity and acknowledgements.

```ts
type BuildInstruction =
  | { kind: "code_link"; projectId: string; target:
      { kind: "folder"; localSelectionId: string }
      | { kind: "github"; repository: string }
      | { kind: "new_github"; repository: string } }
  | { kind: "build_turn"; starTaskId: string; sourceMessageId: string }
  | { kind: "build_approval"; starTaskId: string; requestId: string; decision: "accept" | "decline" };

type BuildTaskEvent = { type: "build"; event: BuildEvent };
```

- [ ] Add authenticated queue RPCs `queue_project_code_link`, `queue_build_turn` and `queue_build_approval` to validate project membership and room edit access and anchor the job to the authorized project, current Star, source message and device. Derive the build target device from the link. Require the chosen device to belong to the linking user and support the managed Claude or Codex provider. Reject direct generic task creation for the new kinds, and derive paths and thread identifiers server-side or on the Mac. Bind an approval to the current outstanding request on the authorized Star.
- [ ] Extend the existing claim and hydration pipeline so the first build turn can use its own task ID as Star ID, and follow-ups and approval jobs keep the original Star ID. Do not require content-only prompt or manifest hydration for build jobs. Transactionally create the first Star/summary with the first build queue operation, using the unique source message identity to avoid duplicate Stars.
- [ ] Extend the existing append and settle RPCs so build projection is atomic with the lease operation. Recheck device, attempt, room and target Star identity, then project the validated event into the current summary. ACK an identical repeated sequence without reprojecting it. A stale attempt or stale approval cannot clear a newer approval or change a settled build. `code_link` settlement writes the authorized code link, `build_turn` settlement sets the terminal Star state, and `build_approval` settlement records the approval task outcome without prematurely settling the build.
- [ ] Add pgTAP cases for owner and outsider, device mismatch, expired lease, duplicate queueing, repeat event, stale approval and valid parallel approval while the build task keeps its lease. Verify ordinary task and Star tests continue to pass. Run `pnpm test:sql`, then `pnpm test:db` on a disposable Supabase stack.

### Task 3. Execute and resume build jobs on the paired Mac

**Files.** Create `apps/connector/src/tasks/build-task.ts` and its colocated tests. Dispatch build tasks from the connector by explicit kind, and wire `apps/connector/src/agent.ts` to create and stop the engine.

- [ ] Map a locally validated folder selection to a Git repository root. Store the absolute path and base ref only under the connector's private state directory. Use `engine_project_id` to reconnect later. Choose an Orion-managed destination for clones. For a new GitHub repo, initialize and commit the starter folder locally, publish privately, then register the project in T3. Before enabling either GitHub option, verify the engine sees the intended local `gh` authentication with its private `HOME`. Pass a narrowly scoped `GH_CONFIG_DIR` if needed. Never forward auth output or credential material.
- [ ] Start by claiming the existing task and locating its locally stored IDs. Use the Star UUID as the T3 thread UUID and the task UUID as the retry-stable command ID. Persist the active run and last accepted sequence in private state. Reconcile an existing run before dispatch on retry. Use the linked repo's actual default branch or recorded base ref. Choose `orion/<normalized-star-title>`, increment a numeric suffix on a branch collision, and persist the branch before further messages.
- [ ] Translate the subscription into Orion events. A pending runtime request plus its matching approval item sets `needs_you`; resolved requests return the active build to `working`. Keep approval events and terminal events immediate. Coalesce step labels to at most one every two seconds, sanitize labels and trim to their contract bounds. Keep final reply text within the gateway budget. Translate the turn's checkpoint diff to capped per-path plus/minus totals, handling quoted and binary paths and keeping line text local.
- [ ] On a transient socket failure, reconnect, inspect the projection and resume from the last sequence. On restart, reconcile the engine's current run before taking new action. Map completed, cancelled/interrupted and failed runs to `done`, `cancelled` and `failed`, respectively. Release the active run on connector cancellation. Process approval jobs concurrently with waiting build jobs. Verify only the exact pending request can be answered.
- [ ] Instantiate the installer, process and client lazily when the first build task is claimed. Clean up the engine on SIGINT, SIGTERM and terminal connector shutdown. Do not route build tasks through `TaskExecutor`'s content adapters or start T3 at sign-in. Unit-test lazy launch, retry idempotence, crash reconciliation, throttle, approval and stop. Run connector unit, integration and bundle tests.

### Task 4. Connect the composer, code links and Build Star UI

**Files.** Use `apps/web/src/features/rooms/components/composer.tsx`, `apps/web/src/features/native/{bridge,native-stream-bridge}`, the existing project and Star views, `apps/mac/Sources/Orion/Project/ChatComposer.swift` and `apps/mac/Sources/OrionAppCore/Stream/StarRouteChoice.swift`. Add colocated tests.

- [ ] Run the Astryx CLI discovery workflow before building the web UI. Reuse existing composer, status and Star layouts. Render rows for changed files and set the existing hat state from the persisted status.
- [ ] Preserve route intent across the native bridge with `answer` as the legacy fallback. Use the boundary below in the ordinary composer and direct Build Star follow-ups. Continue enforcing the existing room identity and snapshot guards during asynchronous routing.

```text
answer                 -> existing message flow
unsure                 -> keep draft and ask “Build this?”
accepted build intent  -> link code when missing, otherwise queue the build on the linked Mac
build-Star follow-up   -> queue a continuation for that Star
```

- [ ] Keep the original draft while collecting a link or resolving uncertain intent. On the Mac, use a native folder picker and transfer only the opaque selection identifier across the hosted boundary. Expose GitHub and private-repo creation in project settings. Browser sessions can link GitHub code to a paired Mac; local folder selection belongs to that Mac.
- [ ] Read the scoped summary and subscribe through the room's lifecycle. Show status, latest step, branch and changed files. Render Approve and Decline only for an authorized pending request, and disable both during submission. Keep the last summary visible when the linked Mac is offline. Use the existing reconnect behavior for queued jobs. Cover stale route results, declined intent, a pending request, duplicate clicks and an offline summary.

### Task 5. Run the rollout acceptance checks

- [ ] Start a clean isolated Supabase stack, apply migrations and run `pnpm test:db`, `pnpm test:sql`, `pnpm typecheck`, the connector and gateway suites, and the Mac test target.
- [ ] Run a Playwright test from an empty project. Link a scratch repo, submit a build request, handle one approval and see the resulting branch and changed file. Drive the pinned T3 server with its Replay provider when available. Keep deterministic captured-frame tests for transport cases and record which provider the end-to-end run exercised.
- [ ] Run one managed Claude acceptance build in a scratch repo on this Mac. Confirm the starter checkout stays clean, the change appears in the worktree, the gateway persists the result, and a second session can read the summary while the connector is offline. Exercise Codex login and version detection with the updated pin and record whether a live Codex turn was run.
- [ ] Stop test engines and verify their ports close. Remove only scratch resources created for this run. Record remaining deployment or acceptance gaps in the spike report and keep credentials and private paths out of captured fixtures.
