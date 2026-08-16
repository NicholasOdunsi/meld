# Plan: screen-to-screen connections

Design spec: `docs/superpowers/specs/2026-08-14-screen-connections-design.md`
(read it for full rationale). Phase 1 (prototype-package core) is already
committed: `resolveActionTargets`, `downstreamActionSteps`,
`formatOutgoingStepsForPrompt`, and the action schema's optional `targetNodeId`
all exist in `@meld/prototype` and are exported from its index.

Goal: a screen's navigation buttons link to other screens so the "Try" preview
navigates. Buttons carry a symbolic `targetNodeId` (the journey step), resolved
to a screen at read time; a manual canvas arrow overrides that.

## Global Constraints

- **Follow existing patterns.** New SQL mirrors existing migrations
  (`supabase/migrations/202608140002_user_flow_assist.sql` is the reference for
  security-definer RPCs, RLS, grants, `set search_path = ''`, and the room-edit
  gate `public.can_edit_room` / `public.is_room_participant`). New readers mirror
  `prototype-reader.ts` / `canvas-screen-reader.ts`. New web code mirrors the
  surrounding feature's Zod-validated server-action + component style.
- **Backward compatibility.** `targetScreenId` stays present on actions; already
  persisted versions (with only `targetScreenId`) must keep working. Never break
  the `@meld/prototype` public contract Phase 1 established.
- **Resolution lives in `@meld/prototype`.** Use the existing
  `resolveActionTargets` — do not reimplement the precedence
  (override → node → legacy → null).
- **The harness/`buildPrototypeDocument` do not change.** They consume a resolved
  `targetScreenId`. Readers resolve before assembly.
- **Tests required per task.** Unit tests for pure logic; component tests via the
  repo's existing web test setup; pgTAP for SQL. Do not weaken existing tests.
- **Verification.** `pnpm --filter @meld/prototype test`,
  `pnpm --filter @meld/web typecheck`, and the connector build must stay green.
  SQL tasks run the repo's pgTAP suite.
- Commit each task with a clear message + the required Co-Authored-By trailer.
  Do not touch unrelated already-modified files in the tree (`conversation.tsx`,
  `room-conversation-pixel-pattern.svg`, pre-existing `*.test.*` WIP, the
  `user_flow_assist` migrations).

## Task 1: DB migration — action-link overrides table + RPCs

Create a migration `supabase/migrations/2026081500XX_design_screen_action_links.sql`.

- Table `public.design_screen_action_links`:
  - `screen_id uuid not null references public.design_screens(id) on delete cascade`
  - `action_id text not null` (matches the action id regex constraint used in the
    payload: `^[a-z][a-z0-9_-]{0,63}$`)
  - `target_screen_id uuid not null references public.design_screens(id) on delete cascade`
  - `created_at`, `updated_at timestamptz not null default now()`
  - primary key `(screen_id, action_id)`
  - a check or trigger keeping both screens in the same room is NOT required for
    v1, but `target_screen_id <> screen_id` (no self-link) IS enforced.
- RLS enabled; `revoke all` from anon/authenticated/service_role, then
  `grant select` to authenticated + service_role; a select policy gated on
  `public.is_room_participant` of the screen's room (join `design_screens`).
- RPC `public.set_design_screen_action_link(target_screen_id uuid,
  target_action_id text, target_link_screen_id uuid) returns boolean` — security
  definer, `set search_path = ''`, gated on `public.can_edit_room` of the source
  screen's room; validates both screens exist, are in the SAME room, are not
  soft-deleted, and are not equal; upserts. Returns whether a row was written.
- RPC `public.clear_design_screen_action_link(target_screen_id uuid,
  target_action_id text) returns boolean` — same gating; deletes; returns `found`.
- `revoke all ... from public, anon, service_role` then
  `grant execute ... to authenticated` for both RPCs.
- pgTAP test `supabase/tests/design_screen_action_links.test.sql`: table exists,
  RLS on, set/clear happy path, cross-room rejected, self-link rejected,
  non-editor rejected, cascade on screen delete.

Depends on: nothing. Files: one migration, one pgTAP test.

## Task 2: Readers resolve action targets (preview + canvas)

Make both screen readers resolve each action to a concrete `targetScreenId`
before assembly, using `resolveActionTargets` from `@meld/prototype`.

- Add a server reader `readRoomActionLinks(roomId)` (new file or in an existing
  design reader) returning, per screen, a `Map<actionId, targetScreenId>` built
  from `design_screen_action_links` joined to the room's screens. Fake path for
  `isRoomFakeEnabled()` returning empty is fine.
- `prototype-reader.ts`: build `nodeToScreenId` from the room's screens
  (`id` + `flow_node_id`), fetch overrides, and for each built screen call
  `resolveActionTargets(version.actions_json, { nodeToScreenId, overrides })`;
  pass the resolved actions into assembly. Legacy rows still resolve.
- `canvas-screen-reader.ts`: same resolution so the canvas overlay preview links
  match. `nodeToScreenId` here is trivially available (each `CanvasScreen` has
  `flowNodeId`).
- Parsing note: `actions_json` is parsed with `DesignScreenActionSchema`, which
  now tolerates `targetNodeId`; confirm legacy rows (no `targetNodeId`) still
  parse.
- Tests: extend the readers' tests (or add ones) proving node-resolution,
  override-wins, and legacy passthrough end to end (a built screen whose action
  has `targetNodeId` yields a document whose route points at the right screen).

Depends on: Task 1 (override table). Files: the two readers, a small links
reader, their tests.

## Task 3: Generator A1 — journey steps into the prompt, targetNodeId out

Feed the generator the downstream steps so it tags each nav action, and switch
the response contract to `targetNodeId`.

- Client: in the screen-composer generation path, compute the target screen
  node's downstream steps with `downstreamActionSteps(flow, flowNodeId)` (flow is
  available on the canvas via `flowDocumentFromShapes`; the selected screen's
  `flowNodeId` comes from the canvas screens) and pass them to the generation
  server action.
- `generateDesignScreen` (`design-screen-generation.ts`): add an optional
  `steps: OutgoingStepsSchema` input; when present, append
  `formatOutgoingStepsForPrompt(steps)` to the instruction (same mechanism as the
  sketch layout via `combineInstructionWithLayout`, or an analogous combiner).
- Connector `design-screen-generate-prompt.ts`: response schema action field
  `targetScreenId` → `targetNodeId` (`{ type: ["string","null"] }`); add a base
  rule telling the model to set `targetNodeId` from the supplied NEXT STEPS list
  or null, and never invent ids. Bump `DESIGN_SCREEN_GENERATE_PROMPT_VERSION` is
  NOT required (provenance only), but update the prompt tests.
- Tests: prompt includes the formatted steps; response schema exposes
  `targetNodeId`; the server action embeds steps into the instruction.

Depends on: Phase 1. Files: connector prompt (+test), `design-screen-generation.ts`
(+test), the composer/generation client wiring (+ any hook), tests.

## Task 4: Composer "Build next step →" (T1)

In `screen-composer.tsx`, when exactly one screen frame is selected, render a
"Build <label> →" button per downstream step of that screen's flow node.

- Compute steps with `downstreamActionSteps(flow, selectedFlowNodeId)`. The
  composer needs the flow and the selected screen's `flowNodeId`; thread them in
  from `user-flow-trial-canvas.tsx` (it holds the editor/flow and the canvas
  screens) rather than refetching.
- Each button targets that step's screen: find the `design_screen` whose
  `flow_node_id` === step.nodeId (already seeded as an empty frame; if none
  exists, fall back to the existing create-then-generate path with that
  `flow_node_id`). Runs generation with the current instruction and that step's
  steps context (Task 3).
- Keep it inside the existing composer; do not add a new surface.
- Tests: given a selection + a flow with N downstream steps, N build buttons
  render with the right labels and each triggers generation against the right
  screen.

Depends on: Task 3. Files: `screen-composer.tsx` (+test),
`user-flow-trial-canvas.tsx` threading, tests.

## Task 5: Canvas arrow manual override (C2a)

Let a user draw a tldraw arrow between two screen frames to link a button.

- Detect an arrow whose start and end bindings resolve to two different screen
  frames (`shape.meta.meldScreenId`).
- On completion, present a picker of the SOURCE screen's nav actions (labels from
  its current version's `actions_json`); auto-pick when exactly one. The picker
  can be a small overlay near the arrow (reuse existing overlay/portal patterns
  in the canvas feature).
- On pick: call `set_design_screen_action_link(sourceScreenId, actionId,
  targetScreenId)`; tag the arrow `meta` `{ meldLink: { sourceScreenId, actionId,
  targetScreenId } }`. Removing such an arrow calls
  `clear_design_screen_action_link`.
- On load, reconcile existing links from the override table into arrows between
  frames (mirror `screen-frame-reconcile.ts`). A link whose screens moved keeps
  its binding.
- Persist via a Zod-validated server action wrapping the two RPCs (mirror
  `design-screen-generation.ts`).
- Tests: an arrow between two frames opens the picker and persists a link (server
  action test + the reconcile/detection unit logic). Full tldraw E2E is optional;
  cover the pure detection + persistence units.

Depends on: Task 1 (RPCs), Task 2 (resolution + reconcile pattern). Files: canvas
overlay/interaction code, a server action (+test), reconcile helper (+test).
