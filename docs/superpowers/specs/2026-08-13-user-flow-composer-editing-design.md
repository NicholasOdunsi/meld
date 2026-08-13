# User Flow Composer & AI Editing — Design

**Date:** 2026-08-13
**Status:** Approved (design), pending implementation plan

## Problem

The User Flow canvas today offers a single one-shot **Generate User Flow** button
(`user-flow-generation-controls.tsx`). It produces a whole `FlowDocument` from room
context and maps it onto tldraw shapes, but there is no way to *edit* the flow with
AI afterwards — no "add an error path after payment", no "rename these steps". Every
change is manual, or a full regeneration.

The PRD feature already solved the analogous problem with **section assist**: an
in-document composer where the user types a natural-language request and the Product
Agent decides whether to answer, propose an edit, or ask a clarifying question; edit
proposals surface as a diffable card the user Applies (with a staleness guard).

We want to bring that composer-driven, review-gated editing loop to the User Flow
canvas. The one-shot Generate button is being removed (already done) so the UI can be
rebuilt around a persistent composer.

## Goals

- A single **composer** on the canvas that handles both first-draft generation and
  ongoing edits ("unified entry").
- Natural-language edits to an existing flow, scoped by description (not by canvas
  selection) — "add a retry after payment", "rename the onboarding steps".
- A **review gate**: edits are held as a proposal the user reviews and Applies/Discards
  before they touch the canvas — matching PRD muscle memory.
- Maximum reuse of the existing flow-generation pipeline (schema, validation,
  connector execution, materialization, recovery) and the existing composer primitives.

## Non-goals

- Selection-scoped editing (scoping to specific selected shapes). Whole-flow context
  only; the agent locates targets from the description.
- Pure Q&A / "answer" outcomes (asking questions about the flow without changing it).
  Outcomes are **action** (generate/edit → proposal) or **clarify** (needs_context)
  only. A future phase may add answer outcomes.
- In-place ghost preview of proposed changes on the canvas as the *primary* review
  surface. Deferred; the review card is a text change-summary. (Ghost preview may be a
  later enhancement.)
- Room-wide broadcast of pending proposals. Proposals are requester-scoped.

## Confirmed decisions

1. **Composer role:** unified entry — one prompt box handles generate (empty canvas)
   and edit (populated canvas). The agent/context decides which.
2. **Scope:** whole-flow always. No canvas selection needed; the agent receives the
   full current `FlowDocument` and locates targets from the instruction.
3. **Landing model:** review gate. Edits are held as a proposal; the user sees a
   summary of what will change and clicks Apply/Discard before it touches the canvas.
4. **Agent output:** a whole rewritten `FlowDocument`, diffed by node/edge id against
   the current one to derive added/removed/relabeled for the review card. Reuses the
   existing `FlowDocumentSchema` and graph validation.
5. **Placement:** docked floating bar, bottom-center over the canvas
   (Figma/Cursor-style command bar). Placeholder adapts to empty vs populated.
6. **Outcomes:** action + clarify only. No pure Q&A.
7. **Concurrency on Apply:** apply the *diff* onto the live canvas, keyed by node id;
   preserve manual repositioning and concurrent edits; skip-and-flag ops whose target
   node was deleted since the snapshot.
8. **Empty-canvas generation applies directly** (nothing to diff — all additions);
   **edits go through the review gate.**
9. **Review card is a text change-summary** (in-place ghost preview deferred).
10. **Pending proposal is requester-scoped** but persisted for reload recovery.

## Architecture

Two existing paths inform this design and are reused wherever possible:

- `user_flow_generate` — the current whole-flow generation task. Action
  `generateUserFlow` → RPC `create_user_flow_generate_task` → connector → materialized
  into `public.user_flow_generations` → polled → `applyGeneratedFlow` maps
  `FlowDocument` onto tldraw shapes. (`apps/web/src/features/canvas/*`,
  `apps/connector/src/tasks/user-flow-generate-prompt.ts`,
  `supabase/migrations/202608100001_user_flow_generation.sql`.)
- `prd_section_assist` — the PRD composer→proposal→review→apply loop, with server-side
  outcome materialization, polling (deliberately off Realtime), a diffable proposal
  card, and an apply RPC with a staleness guard. (`apps/web/src/features/prd/*`,
  `apps/connector/src/tasks/prd-section-assist-prompt.ts`,
  `supabase/migrations/202608080005_prd_section_assistance.sql`.)

The new work is a `user_flow_assist` task kind that combines them: it takes the
generate pipeline's flow schema/validation/materialization and wraps it in the
section-assist proposal/review/apply loop.

### 1. Canvas composer (UI)

A docked floating bar, bottom-center, over the tldraw editor host — replacing the
removed `UserFlowGenerationControls`. It reuses the design-system composer primitives
the PRD selection composer uses (`ChatComposer`, `useComposerMentions`,
`AgentRoutingChip`, `useRoomRouting`) so provider/model routing, readiness, and styling
match the rest of the app.

States:

- **Empty canvas** → placeholder "Describe the flow to generate…". Submit → generate.
- **Populated canvas** → placeholder "Request a change…". Submit → edit (proposal).
- **Working** → inline spinner and the existing generating-glow on the editor host.
- **Needs context** → the existing `needs_context` clarify path renders its question
  inline with a follow-up field (two-stage, same as today's generation flow).
- **Proposal ready** → a review card anchored above the bar (see §3).
- Hidden entirely for **view** access (same as today).

Generation on an empty canvas applies directly (as today). Edits produce a proposal.

### 2. Data & task pipeline

New task kind **`user_flow_assist`**, alongside `user_flow_generate`:

- **Server action** `assistUserFlow({ roomId, instruction, currentFlow, clientRequestId })`.
  Unlike generate, it sends the current `FlowDocument` (captured from the canvas via the
  existing `extractFlowFromEditor`/`flowDocumentFromShapes`) as frozen base context.
  `clientRequestId` provides idempotency (as in PRD assist).
- **RPC** `create_user_flow_assist_task` — `security definer`, gates on edit access via
  `can_edit_room`, freezes the base flow + context manifest, dedups active tasks with
  the same advisory-lock + partial-unique-index pattern as generate, inserts the
  `ai_tasks` row (+ a request row modeled on `prd_assist_requests`).
- **Connector** — new `user_flow_assist` executor and prompt. Input = base
  `FlowDocument` + instruction. Output = a full updated `FlowDocument`, validated by the
  **existing `FlowDocumentSchema`** (`packages/contracts/src/user-flow.ts`) so all graph
  invariants (one start, ≥1 reachable end, unique ids, cycles only through decision
  nodes) are enforced identically to generation. If the model can't proceed, it emits a
  `needs_context` clarifying question.
- **Materialization** — DB trigger copies the settled result into a narrow table
  `user_flow_assist_proposals` (modeled on `user_flow_generations` + `prd_proposals`):
  base snapshot + proposed flow + `applied_at`/status. Browsers never read
  `ai_tasks.result_json`; they read via `get_user_flow_assist_proposal` /
  `list_unapplied_user_flow_assist_proposals` RPCs and **poll** (assist requests
  deliberately off Realtime, exactly like PRD assist).

### 3. Diff & apply (the review gate)

- On proposal ready, compute a **diff by node/edge id** between the base `FlowDocument`
  and the proposed one:
  `{ nodesAdded, nodesRemoved, nodesRelabeled, edgesAdded, edgesRemoved }`.
  `nodesRelabeled` covers `label`/`detail` changes on a matched id.
- The **review card** (anchored above the composer bar) shows a text summary
  ("+2 nodes · 1 relabeled · +1 edge") with an expandable list of specific changes, and
  **Apply** / **Discard** buttons.
- **Apply** commits the diff onto the **live canvas**, keyed by `flowNodeId` /
  `flowEdgeId` (provenance meta already stamped on every shape by
  `flow-document-to-tldraw.ts`):
  - Add new nodes/edges (position new nodes via the existing depth-layout helper).
  - Relabel/redetail matched shapes in place.
  - Remove removed shapes.
  - If a targeted node was **deleted meanwhile** (its id is no longer on the canvas),
    skip that op and flag it on the card ("1 change couldn't apply — that step no longer
    exists").
  - Manual repositioning and concurrent edits survive because we apply a diff rather
    than replace the frame.
- Applying marks the proposal applied (`mark…Applied`) and the existing leave-sync
  (`syncUserJourneyFromCanvas`) pushes the updated journey back to the PRD user-journeys
  section as it does today.

### 4. Access, concurrency, recovery

- **Access** — enforced server-side in the RPC (`can_edit_room`), never trusted from the
  client, same as PRD/generate. The composer is hidden for view access; the action and
  RPC early-return / reject for non-editors.
- **Concurrency** — one active assist task per initiator (dedup partial-unique index),
  consistent with generate.
- **Recovery** — unapplied proposals are drained on mount via
  `list_unapplied_user_flow_assist_proposals`, so a reload doesn't lose a pending
  proposal (same pattern as `listUnappliedUserFlowGenerations`).
- **Visibility** — proposals are requester-scoped (the requester's composer shows the
  card) but persisted for reload recovery. Not broadcast room-wide (a flow edit isn't
  anchored to a shared section the way a PRD proposal is).
- **Trial gating** — the whole feature stays behind `isCanvasTrialEnabled()`
  (`NODE_ENV !== "production" && MELD_USER_FLOW_TRIAL_ENABLED === "true"`), same as the
  rest of the canvas trial. All new actions/RPCs respect it.

## Component boundaries

- `user-flow-composer.tsx` — the docked composer bar; owns input, submit, working
  state, and rendering of the clarify/proposal surfaces. Consumes a hook, no direct data
  access.
- `use-user-flow-assist.ts` — state machine hook (idle → queued → running →
  needs_context | proposal_ready | failed), submit + poll + recovery drain. Mirrors
  `use-user-flow-generation.ts`.
- `user-flow-assist.ts` — server actions (`assistUserFlow`, `getUserFlowAssistProposal`,
  `listUnappliedUserFlowAssistProposals`, `markUserFlowAssistProposalApplied`).
- `flow-document-diff.ts` — pure `diffFlowDocuments(base, next)` → structured diff.
  Independently unit-testable.
- `apply-flow-diff.ts` — pure-ish `applyFlowDiff(editor, diff)` → applies onto the live
  tldraw store, returns `{ applied, skipped }`. Independently testable against a tldraw
  test store.
- `user-flow-assist-proposal-card.tsx` — renders the diff summary + Apply/Discard +
  skipped-op flags.
- Connector: `user-flow-assist-prompt.ts` + a `task-executor.ts` branch for the new
  kind.
- SQL: a new migration for `create_user_flow_assist_task`,
  `user_flow_assist_proposals`, its materialization trigger, and the get/list/apply
  RPCs.

## Data flow (edit)

```
composer submit (instruction)
  → capture current FlowDocument from canvas (extractFlowFromEditor)
  → assistUserFlow action
  → create_user_flow_assist_task RPC (freeze base flow, gate access, dedup)  → { taskId }
  → connector claims task, runs prompt (base flow + instruction)
  → returns updated FlowDocument (validated by FlowDocumentSchema) OR needs_context
  → gateway settles ai_tasks.result_json
  → materialize trigger → user_flow_assist_proposals row (status ready)
  → browser poll (getUserFlowAssistProposal) → proposal_ready
  → diffFlowDocuments(base, proposed) → review card
  → user Apply → applyFlowDiff(editor, diff) onto live canvas (skip-and-flag deletes)
  → markUserFlowAssistProposalApplied
  → leave-sync pushes journey to PRD
```

## Error handling

- Task terminal-non-completed → composer shows failure with a Retry (reuses the room
  task-status terminal check already in `use-user-flow-generation.ts`).
- Materialization not yet visible → bounded poll with materialization-attempt cap, as in
  generation.
- Proposed flow fails `FlowDocumentSchema` at the connector → task fails with a
  participant-safe message; no proposal row is written.
- Apply with deleted targets → partial apply; skipped ops surfaced on the card, proposal
  still marked applied (the applicable part landed).
- Access lost between submit and settle → RPC/materialization refuse the proposal, as
  PRD assist refuses `edit_not_permitted`.

## Testing

Co-located, matching existing patterns:

- `flow-document-diff.test.ts` — add/remove/relabel/edge cases, no-op equality.
- `apply-flow-diff.test.ts` — apply onto a tldraw test store; the skip-and-flag
  deleted-target case; preservation of manual position.
- `use-user-flow-assist.test.tsx` — state machine, poll, recovery drain, needs_context.
- `user-flow-composer.test.tsx` — empty vs populated placeholder, working state, card
  render, view-access hidden.
- `supabase/tests/user_flow_assist.test.sql` — RPC access gating, dedup, materialization
  outcome — modeled on `user_flow_generation.test.sql`.

## Rollout

- Ships behind the existing canvas trial flag; no production exposure until the trial is
  promoted.
- The removed Generate button is already gone; the composer is its replacement. The
  underlying `user_flow_generate` pipeline is retained and invoked from the composer's
  empty-canvas path (and still by the Product Agent proposal "Create user flow" button).
```
