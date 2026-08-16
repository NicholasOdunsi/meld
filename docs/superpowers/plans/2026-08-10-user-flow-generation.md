# User Flow Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a PRD-grounded Draft journey through the existing Product Agent pipeline, insert it idempotently into the shared tldraw room, and preserve full manual drawing/editing.

**Architecture:** Add `user_flow_generate` as a first-class queued AI task. The connector returns a strict shared `FlowDocument`; PostgreSQL materializes that result into a participant-readable generation record, and the initiating browser maps it deterministically to standard tldraw shapes. The User Flows tab owns clarification, progress, retry, and canvas insertion while the gateway remains authoritative for collaborative writes.

**Tech Stack:** TypeScript 5.9, Zod 4, Next.js 16 server actions, React 19, Supabase/PostgreSQL RPCs, the existing gateway/connector task protocol, tldraw 5.3.0, Vitest 4, and Playwright.

## Global Constraints

- Use Node `22.23.2`: prefix commands with `PATH="/Users/maxuser/.nvm/versions/node/v22.23.2/bin:$PATH"`.
- Keep all tldraw packages pinned exactly to `5.3.0`.
- Keep generation unavailable when `MELD_USER_FLOW_TRIAL_ENABLED` is false or `NODE_ENV=production`.
- Treat PRD content as authoritative and conversation content as supporting evidence.
- Never generate from empty context; return `needs_context` with one concrete question.
- Only room owners, organization admins, and room editors may generate. Viewers remain read-only.
- Use standard tldraw frame/geo/text/arrow records; do not introduce custom shapes.
- Preserve manual drawing, selection, connectors, text, and edits before and after generation.
- Derive generated shape IDs from `taskId` plus flow record ID so applying an artifact twice is idempotent.
- Do not expose `ai_tasks.result_json`, raw prompts, provider errors, canvas tickets, or secrets to browsers.
- Follow `AGENTS.md`: Astryx layout/components, tokenized styles, no raw layout elements, and `pnpm check:astryx`.

## File Responsibility Map

- `packages/contracts/src/user-flow.ts`: authoritative `FlowDocument` contract and graph validation.
- `supabase/migrations/202608100001_user_flow_generation.sql`: task creation, hydration, materialization, RLS, and safe reads.
- `apps/connector/src/tasks/user-flow-generate-prompt.ts`: Product Agent instructions and provider JSON schema.
- `apps/web/src/features/canvas/user-flow-generation.ts`: server actions and safe result parsing.
- `apps/web/src/features/canvas/flow-document-to-tldraw.ts`: deterministic layout and tldraw mapping.
- `apps/web/src/features/canvas/use-user-flow-generation.ts`: client task state machine.
- `apps/web/src/features/canvas/user-flow-trial-canvas.tsx`: manual tools, generation controls, and artifact insertion.
- `e2e/user-flow-trial.spec.ts`: browser and collaboration acceptance gates.

---

### Task 1: Shared Flow Document Contract

**Files:**
- Create: `packages/contracts/src/user-flow.ts`
- Create: `packages/contracts/src/user-flow.test.ts`
- Modify: `packages/contracts/src/ai.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/ai.test.ts`
- Modify: `packages/contracts/src/contracts.test.ts`

**Interfaces:**
- Produces `FlowNodeKindSchema`, `FlowNodeSchema`, `FlowEdgeSchema`, `FlowDocumentSchema`, and `FlowDocument`.
- Extends `AITaskKindSchema` with `user_flow_generate`.
- Limits: 40 nodes, 80 edges, 10 open questions, 80-character labels, 500-character details, and 120-character edge labels.

- [ ] **Step 1: Write failing contract tests**

Test a valid Start → Action → Decision → System/End graph, duplicate IDs,
missing endpoints, missing Start/End, exceeded limits, and a cycle containing no
decision.

```ts
expect(FlowDocumentSchema.parse({
  title: "Ownership transfer",
  summary: "An owner transfers a workspace.",
  nodes: [
    { id: "start", kind: "start", label: "Transfer requested", detail: null },
    { id: "eligible", kind: "decision", label: "Recipient eligible?", detail: null },
    { id: "done", kind: "end", label: "Ownership transferred", detail: null },
  ],
  edges: [
    { id: "e1", from: "start", to: "eligible", label: null },
    { id: "e2", from: "eligible", to: "done", label: "Yes" },
  ],
  openQuestions: [],
}).nodes).toHaveLength(3);
```

- [ ] **Step 2: Run tests and confirm missing exports fail**

```bash
PATH="/Users/maxuser/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/contracts test -- user-flow.test.ts ai.test.ts contracts.test.ts
```

- [ ] **Step 3: Implement strict schemas and graph refinement**

```ts
export const FlowNodeKindSchema = z.enum(["start", "action", "system", "decision", "end"]);
export const FlowNodeSchema = z.object({
  id: z.string().trim().regex(/^[a-z][a-z0-9_-]*$/).max(64),
  kind: FlowNodeKindSchema,
  label: z.string().trim().min(1).max(80),
  detail: z.string().trim().min(1).max(500).nullable(),
}).strict();
```

`FlowDocumentSchema.superRefine` must enforce unique node/edge IDs, exactly one
Start, at least one End, valid endpoints, and reject each detected cycle whose
node set contains no `decision` node.

- [ ] **Step 4: Extend task-kind and envelope tests**

Prove `AITaskKindSchema`, `AIContextPackageSchema`, and `AIResultEnvelopeSchema`
accept `user_flow_generate` and still reject unknown kinds.

- [ ] **Step 5: Verify and commit**

```bash
PATH="/Users/maxuser/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/contracts test
PATH="/Users/maxuser/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/contracts typecheck
git add packages/contracts/src
git commit -m "feat(user-flow): define generated flow contract"
```

---

### Task 2: Secure Task And Materialized Artifact

**Files:**
- Create: `supabase/migrations/202608100001_user_flow_generation.sql`
- Modify: `apps/gateway/src/integration-fixtures.ts`
- Modify: `apps/gateway/src/server.integration.test.ts`
- Modify: `apps/gateway/src/tasks/task-repository.test.ts`

**Interfaces:**
- Produces `create_user_flow_generate_task(target_room_id uuid, target_provider ai_provider, target_clarification text)`.
- Produces `get_user_flow_generation(target_task_id uuid)` returning only `{taskId, roomId, document, createdAt}`.
- Produces `public.user_flow_generations(task_id, room_id, organization_id, initiating_user_id, document, created_at)`.
- Extends task hydration so `user_flow_generate` receives the full current PRD when available.

- [ ] **Step 1: Add failing SQL/integration assertions**

Cover unauthenticated/viewer rejection, owner/admin/editor success, active-task
idempotency, 2,000-character clarification limit, one-time materialization,
participant reads, outsider rejection, and continued denial of direct
`ai_tasks.result_json` reads.

- [ ] **Step 2: Run focused integration tests and confirm failure**

```bash
PATH="/Users/maxuser/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/gateway test:integration -- server.integration.test.ts
```

- [ ] **Step 3: Implement schema and task creation invariants**

```sql
alter type public.ai_task_kind add value if not exists 'user_flow_generate';

create table public.user_flow_generations (
  task_id uuid primary key references public.ai_tasks(id) on delete cascade,
  room_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  initiating_user_id uuid not null references auth.users(id),
  document jsonb not null check (pg_column_size(document) <= 262144),
  created_at timestamptz not null default now(),
  foreign key (room_id, organization_id)
    references public.discovery_rooms(id, organization_id) on delete cascade
);
```

Add an active partial unique index on `(room_id, initiating_user_id)`. The
security-definer create RPC must advisory-lock that pair, verify editor-level
access, resolve the caller's configured device/provider, freeze a bounded room
manifest, and store clarification only in the task instruction.

- [ ] **Step 4: Extend hydration and materialization**

Hydration must attach the full current PRD for `user_flow_generate`, while still
supporting pre-PRD conversation context. The trigger must require completed,
non-partial `user_flow_generate` output and insert with
`on conflict (task_id) do nothing`.

- [ ] **Step 5: Add RLS and safe result RPC**

Allow participant selects, deny browser writes, and return no instruction,
provider error, task manifest, or raw result envelope from the safe RPC.

- [ ] **Step 6: Verify and commit**

```bash
PATH="/Users/maxuser/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm test:sql
PATH="/Users/maxuser/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/gateway test:integration -- server.integration.test.ts
PATH="/Users/maxuser/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/gateway typecheck
git add supabase/migrations/202608100001_user_flow_generation.sql apps/gateway/src
git commit -m "feat(user-flow): persist authorized generation tasks"
```

---

### Task 3: Product Agent Prompt And Connector Execution

**Files:**
- Create: `apps/connector/src/tasks/user-flow-generate-prompt.ts`
- Create: `apps/connector/src/tasks/user-flow-generate-prompt.test.ts`
- Modify: `apps/connector/src/tasks/task-executor.ts`
- Modify: `apps/connector/src/tasks/task-executor.test.ts`
- Modify: `apps/connector/src/tasks/task-executor.integration.test.ts`

**Interfaces:**
- Produces `USER_FLOW_GENERATE_PROMPT_VERSION = "user-flow-generate-v1"`.
- Produces `USER_FLOW_GENERATE_SYSTEM_PROMPT` and `USER_FLOW_GENERATE_RESPONSE_SCHEMA`.
- Extends connector `EXECUTABLE_KINDS` and `TaskResultEnvelope` with `user_flow_generate` parsed by `FlowDocumentSchema`.

- [ ] **Step 1: Write prompt and executor tests**

Assert PRD precedence, untrusted room content, no invented facts, unresolved
gaps in `openQuestions`, JSON-only output, valid node kinds, and
`malformed_output` for broken graph endpoints or exceeded limits.

- [ ] **Step 2: Run focused tests and confirm failure**

```bash
PATH="/Users/maxuser/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/connector test -- user-flow-generate-prompt.test.ts task-executor.test.ts
```

- [ ] **Step 3: Implement the closed provider schema and prompt**

Every object must set `additionalProperties: false`; all contract fields are
required; nullable values use JSON Schema union/null; array and string maxima
match Task 1 exactly.

- [ ] **Step 4: Register connector execution**

```ts
user_flow_generate: {
  promptVersion: USER_FLOW_GENERATE_PROMPT_VERSION,
  systemPrompt: USER_FLOW_GENERATE_SYSTEM_PROMPT,
  responseSchema: () => USER_FLOW_GENERATE_RESPONSE_SCHEMA,
  parseResult: (result: unknown) => FlowDocumentSchema.parse(result),
  envelopeKind: "user_flow_generate" as const,
},
```

- [ ] **Step 5: Verify and commit**

```bash
PATH="/Users/maxuser/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/connector test
PATH="/Users/maxuser/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/connector typecheck
PATH="/Users/maxuser/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/connector lint
git add apps/connector/src/tasks
git commit -m "feat(user-flow): execute Product Agent flow generation"
```

---

### Task 4: Web Generation Service And Polling

**Files:**
- Create: `apps/web/src/features/canvas/user-flow-generation.ts`
- Create: `apps/web/src/features/canvas/user-flow-generation.test.ts`
- Create: `apps/web/src/features/canvas/use-user-flow-generation.ts`
- Create: `apps/web/src/features/canvas/use-user-flow-generation.test.tsx`
- Modify: `apps/web/src/features/ai/room-task-status.ts`
- Modify: `apps/web/src/features/ai/room-task-status.test.ts`

**Interfaces:**
- Produces `generateUserFlow(input): Promise<GenerateUserFlowResult>`.
- Produces `getUserFlowGeneration(taskId): Promise<UserFlowGeneration | null>`.
- Produces `useUserFlowGeneration({roomId, access, onGenerationReady})`.

```ts
export type GenerateUserFlowResult =
  | { status: "queued"; taskId: string }
  | { status: "needs_context"; question: string }
  | { status: "error"; message: string };

export type UserFlowGeneration = {
  taskId: string;
  roomId: string;
  document: FlowDocument;
  createdAt: string;
};
```

- [ ] **Step 1: Write failing server-action tests**

Cover invalid UUIDs, disabled/production trial, viewer rejection, empty context,
clarification trimming, queued task mapping, safe RPC failure, and strict
materialized document parsing.

- [ ] **Step 2: Write failing hook tests**

Use fake timers for idle → queued → running → completed → applied,
`needs_context`, terminal failure, retry, unmount cleanup, viewer no-op, and
exactly-once `onGenerationReady` across repeated polls.

- [ ] **Step 3: Run focused tests and confirm failure**

```bash
PATH="/Users/maxuser/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/web test -- user-flow-generation.test.ts use-user-flow-generation.test.tsx
```

- [ ] **Step 4: Implement server actions**

Validate with strict Zod. Return the fixed question “What user goal, starting
point, and successful outcome should this flow cover?” when both PRD and
meaningful conversation context are absent. Never accept client identity,
organization role, or access. Parse safe RPC results with `FlowDocumentSchema`.

- [ ] **Step 5: Implement bounded polling**

Poll the participant-scoped task status every two seconds only while active.
On completion, fetch the materialized artifact and call `onGenerationReady`.
Stop after success, terminal failure, or unmount.

- [ ] **Step 6: Verify and commit**

```bash
PATH="/Users/maxuser/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/web test -- user-flow-generation.test.ts use-user-flow-generation.test.tsx room-task-status.test.ts
PATH="/Users/maxuser/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/web typecheck
git add apps/web/src/features/canvas apps/web/src/features/ai
git commit -m "feat(user-flow): queue and observe flow generation"
```

---

### Task 5: Deterministic Mapping And Manual Canvas UI

**Files:**
- Create: `apps/web/src/features/canvas/flow-document-to-tldraw.ts`
- Create: `apps/web/src/features/canvas/flow-document-to-tldraw.test.ts`
- Create: `apps/web/src/features/canvas/user-flow-generation-controls.tsx`
- Create: `apps/web/src/features/canvas/user-flow-generation-controls.test.tsx`
- Modify: `apps/web/src/features/canvas/user-flow-trial-canvas.tsx`
- Modify: `apps/web/src/features/canvas/user-flow-trial-canvas.test.tsx`
- Modify: `apps/web/src/features/canvas/user-flow-trial-tab.tsx`
- Modify: `apps/web/src/features/canvas/user-flow-trial-tab.test.tsx`

**Interfaces:**
- Produces `flowDocumentToTldrawRecords({taskId, document, originX, originY})`.
- Produces `applyGeneratedFlow(editor, generation)` using one `editor.run` transaction.
- Renders Generate, clarification, progress, retry, Draft/source label, and visible default tldraw tools.

- [ ] **Step 1: Write mapper tests**

Assert deterministic IDs, one frame, one node shape per node, one arrow per
edge, decision diamonds, labelled branches, non-overlapping layout, task
metadata, and identical output for repeated mapping.

- [ ] **Step 2: Write UI/manual-tool tests**

Prove editors receive default tldraw UI, viewers cannot generate, Generate
queues once, clarification accepts text, completed artifacts insert atomically,
and ordinary manual editor methods remain usable afterward.

- [ ] **Step 3: Run focused tests and confirm failure**

```bash
PATH="/Users/maxuser/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/web test -- flow-document-to-tldraw.test.ts user-flow-generation-controls.test.tsx user-flow-trial-canvas.test.tsx
```

- [ ] **Step 4: Implement deterministic standard-shape mapping**

Use IDs seeded as `flow:${taskId}:frame`, `flow:${taskId}:node:${node.id}`,
and `flow:${taskId}:edge:${edge.id}`. Lay the main path left-to-right and place
decision branches on separate rows. Use valid tldraw 5.3 frame/geo/arrow props,
bindings, and `toRichText`.

- [ ] **Step 5: Implement controls and atomic insertion**

Use Astryx `Button`, `TextArea`, `StatusDot`, `Spinner`, `HStack`, and `VStack`.
Apply records inside one `editor.run(() => editor.store.put(records))`, then
zoom to the generated frame. Never clear existing records. Remember applied
task IDs so rerenders cannot duplicate insertion.

- [ ] **Step 6: Fix and verify manual canvas layout**

Give the tldraw host an explicit positioned flex region with stable tokenized
height/width. Keep default UI enabled and ensure generation controls do not
cover the toolbar or canvas. Keep the debug editor handle trial-only.

- [ ] **Step 7: Verify and commit**

```bash
PATH="/Users/maxuser/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/web test -- apps/web/src/features/canvas
PATH="/Users/maxuser/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/web typecheck
PATH="/Users/maxuser/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/web lint
PATH="/Users/maxuser/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm check:astryx
git add apps/web/src/features/canvas
git commit -m "feat(user-flow): generate editable draft journeys"
```

---

### Task 6: End-To-End Generation And Manual Drawing Gates

**Files:**
- Modify: `e2e/user-flow-trial.spec.ts`
- Modify: `apps/gateway/src/canvas/e2e-main.ts`
- Modify: `docs/design/reports/2026-08-10-tldraw-trial-spike.md`

**Interfaces:**
- Extends the explicit authenticated Next-app gate; gateway-only checks remain runnable without Supabase browser auth.
- Produces populated-canvas and toolbar screenshots at desktop and mobile widths when the Next gate is enabled.

- [ ] **Step 1: Add browser acceptance tests**

Assert the toolbar is visible; an editor can manually create, move, and connect
shapes; Generate queues one task; completion inserts all five node kinds; a
second editor sees the records; repeated artifact application creates no
duplicates; and a viewer has no Generate action and cannot mutate.

- [ ] **Step 2: Add clarification and regeneration coverage**

An empty-context room displays the question and writes no shapes. Clarification
retry creates a Draft frame. A second generation creates a separate frame
without deleting or moving the first.

- [ ] **Step 3: Run the trial gate**

```bash
PATH="/Users/maxuser/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm test:e2e:canvas-trial
```

Without `MELD_CANVAS_E2E_APP_BASE_URL`, gateway checks pass and the Next gate is
explicitly skipped. With the authenticated URL, screenshots and canvas-pixel
checks must prove nonblank content and visible controls.

- [ ] **Step 4: Run repository verification**

```bash
PATH="/Users/maxuser/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/contracts test
PATH="/Users/maxuser/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/connector test
PATH="/Users/maxuser/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/gateway test
PATH="/Users/maxuser/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/web test
PATH="/Users/maxuser/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/contracts typecheck
PATH="/Users/maxuser/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/connector typecheck
PATH="/Users/maxuser/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/gateway typecheck
PATH="/Users/maxuser/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm --filter @meld/web typecheck
PATH="/Users/maxuser/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm check:astryx
git diff --check origin/main...HEAD
```

- [ ] **Step 5: Update report and commit**

Record exact commands, exit codes, screenshots, generated record counts,
manual-tool results, clarification results, and explicit skips. Keep the
commercial/production gate unchanged.

```bash
git add e2e/user-flow-trial.spec.ts apps/gateway/src/canvas/e2e-main.ts docs/design/reports/2026-08-10-tldraw-trial-spike.md
git commit -m "test(user-flow): prove generation and manual editing"
```
