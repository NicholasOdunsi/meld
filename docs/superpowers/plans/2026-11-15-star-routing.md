# Star Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route a message written in the main Orion chat into a relevant open Star before it is posted, ask when uncertain, and let the owner correct its Star afterward.

**Architecture:** A short `star_route` task runs on the owner's connected provider. Its result is projected into a participant-readable record; the web bridge waits at most three seconds and returns a route choice to the Mac composer. The composer holds the draft until it has a route or a timeout, then uses the existing `post` path with `starTaskId`. Messages typed inside a Star skip routing.

**Tech Stack:** PostgreSQL/Supabase migrations and pgTAP, shared Zod contracts, TypeScript connector and Next.js bridge, SwiftUI Mac app.

## Global Constraints

- Route at most five recent open Stars from the same room.
- If no Star is eligible, or the check fails or exceeds 3 seconds, send as a new Star.
- Never persist the main-chat message before the routing decision.
- `continue` uses the existing `starFollowupOfTaskId` path. A continuation must never appear in the main chat, even during realtime delivery.
- `ask` presents a compact choice above the Mac composer; the draft remains editable and unsent until the owner chooses.
- A message typed inside a Star always continues that Star with no classification.
- Preserve existing explicit `@Product Agent`, `@Research Agent`, and `@Design Agent` parsing until the new path works. Retire their visible picker only after the route path and its tests pass.
- No provider credentials leave the connected device. A route task result must expose only decision, Star id, and confidence to the room participant.

---

## Task 1: Route result contract and database projection

**Files:** `packages/contracts/src/ai.ts`, its tests, a new migration under `supabase/migrations/`, and a pgTAP test under `supabase/tests/`.

**Interfaces:** Add `StarRouteResultSchema` with `decision: "continue" | "new" | "ask"`, `starTaskId: uuid | null`, and `confidence: number` from 0 to 1. Add `star_route` to `AITaskKindSchema` and the result envelope kind. Use the existing `create_ai_task` RPC with an empty authorized context manifest and a structured instruction carrying the unsent message plus candidates. Add `read_star_route_result(task_id)` as an authenticated, owner-scoped RPC. The result reader returns `null` while pending and the three route fields when complete.

- [ ] **Step 1: Add failing contract tests.** Cover valid `continue`, `new`, and `ask` results; reject an unknown Star id, confidence outside `[0,1]`, and a `continue` without an id. Run `pnpm --filter @meld/contracts test` and observe the missing schema/kind failure.
- [ ] **Step 2: Implement the contract.** Add the Zod schema and inferred type; make the task result envelope accept `star_route` with only that payload. Run the contract tests to green.
- [ ] **Step 3: Create the migration using the installed Supabase CLI.** Run `pnpm exec supabase migration new star_route_task`; inspect the generated filename. Add the enum value and owner-scoped result reader. The existing `create_ai_task` RPC already verifies room participation, device ownership, provider connection and instruction length. The web service validates every candidate Star against room metadata before passing the instruction. The reader checks `initiating_user_id = auth.uid()` and `room_id`, and returns only the route fields, never the whole `ai_tasks.result_json`.
- [ ] **Step 4: Add pgTAP coverage.** Prove a participant can create and read their own route task, a different user cannot read the result, a pending task returns `null`, and a malformed result falls back to `new`. Test cross-room candidate rejection in the web service. Run `pnpm test:database` and `node scripts/orion-online/migration-guard.mjs`.
- [ ] **Step 5: Commit** the contract, migration and tests.

## Task 2: Connected-device route execution

**Files:** `apps/connector/src/tasks/star-route-prompt.ts`, `apps/connector/src/tasks/task-executor.ts`, provider adapter schemas and tests.

**Interfaces:** `buildStarRoutePrompt(message, stars)` quotes both inputs as untrusted data; `TASK_CONFIG.star_route` returns `StarRouteResultSchema` and has a three-second task timeout. The prompt asks for one of the three decisions and one candidate id only.

- [ ] **Step 1: Add failing tests** for a clear continuation, clear new topic, low-confidence ask, malformed id, and prompt injection inside a Star title. Run the focused connector test file and observe failures.
- [ ] **Step 2: Implement prompt and task config.** Parse the route result strictly, force `new` when the chosen id is not among candidates, and map low confidence to `ask`. Keep the entire prompt short enough for the fastest supported provider model.
- [ ] **Step 3: Run** connector tests and typecheck, then commit.

## Task 3: Web route service and bridge handoff

**Files:** `apps/web/src/features/rooms/star-route.ts`, `apps/web/src/features/native/native-stream-bridge.tsx`, `apps/web/src/features/native/bridge.ts`, and focused tests.

**Interfaces:** `routeMainChatMessage({roomId, body, provider, model, stars})` returns `{decision, starTaskId, title}` and times out after 3 seconds; `new` is the error fallback. Add `__orionStream.route(...)` for the Mac composer. Keep `__orionStream.post(...)` unchanged except for accepting the chosen `starTaskId`.

- [ ] **Step 1: Add failing tests** for no candidates, continue, new, ask, timeout, provider error, room mismatch, and in-Star bypass. Assert `postMessage` is not called by `route`.
- [ ] **Step 2: Implement the server service** using the Task 1 RPCs. Select no more than five eligible Stars, sort newest first, validate the returned id against that list, and cancel a still-running route task on timeout where possible.
- [ ] **Step 3: Add the bridge handler** and its result type. Keep route state out of the stream snapshot because it belongs to a single unsent draft.
- [ ] **Step 4: Run** focused and full web tests, TypeScript and ESLint, then commit.

## Task 4: Mac composer route choice

**Files:** `apps/mac/Sources/Orion/Frame/FrameModel.swift`, `apps/mac/Sources/Orion/Project/ChatComposer.swift`, a focused `StarRouteChoice.swift` view, and Mac tests.

**Interfaces:** `FrameModel.routeStream(...)` calls `__orionStream.route`; `ChatComposer.send()` routes only when `star == nil`, holds the draft while waiting, and calls `sendStream(..., starTaskID:)` once on `continue` or `new`. An `ask` result displays the choice above the composer and sends only after the owner chooses.

- [ ] **Step 1: Add tests** that no message is sent while a route is pending; an in-Star send never routes; timeout/error sends a new Star; and selecting either ask option sends exactly once.
- [ ] **Step 2: Implement the compact choice view** using existing Orion design tokens. Keep the typed draft visible and editable. Cancel the pending choice if the text changes or the room changes.
- [ ] **Step 3: Build and run** all Mac tests. Inspect a preview with a route fixture, capture a screenshot in `.context/`, then commit.

## Task 5: Corrections and visible agent picker retirement

**Files:** `apps/web/src/features/rooms/star-store.ts`, `star-actions.ts`, `apps/web/src/features/rooms/components/composer.tsx`, `agent-marker.tsx`, and associated tests; Mac Star/message actions if needed.

**Interfaces:** Add `moveRoomMessageToStar` and `makeRoomMessageItsOwnStar` with same-room ownership checks and an inverse for `room_star_followups`. The visible composer suggestions describe actions as Orion, while legacy typed mentions continue to resolve.

- [ ] **Step 1: Add failing tests** for move, pull out, cross-room refusal, and two-Star display references. Prove a correction updates both thread and main-chat projections.
- [ ] **Step 2: Implement the storage actions** and the UI menu. Keep existing message and reply content unchanged; update only Star membership.
- [ ] **Step 3: Replace visible legacy agent names** in composer suggestions and setup copy. Keep the old mention parser for backward compatibility, and test that a legacy typed mention still works.
- [ ] **Step 4: Run** the full web, connector, database and Mac checks; inspect the Mac preview; commit and open a draft PR.

## Final verification

- [ ] Check 3-second fallback on a disconnected device and no eligible Stars.
- [ ] Verify one clear continuation, one new topic, one ambiguous prompt, and an in-Star reply in the running app.
- [ ] Verify no continuation ever appears in the main timeline, including immediately after realtime delivery.
- [ ] Review security of the new SQL functions and run the migration guard.
- [ ] Merge only after CI is green; verify deploy and connector update instructions.
