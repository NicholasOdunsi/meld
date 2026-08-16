# User Flow Generation Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct every defect found in the user-flow generation review and restore a verified local Supabase environment.

**Architecture:** Keep the existing queued Product Agent task and materialized `FlowDocument` boundary. Add a participant-scoped recovery read, make polling terminal-aware and bounded, strengthen the shared graph contract, and map generated content into bound standard tldraw records placed in open canvas space. Forward-only SQL migrations update hydration without mutating previously applied behavior.

**Tech Stack:** TypeScript 5.9, Zod 4, React 19, Next.js 16 server actions, Supabase/PostgreSQL, tldraw 5.3.0, Vitest 4, Playwright.

## Global Constraints

- Use the PRD as authoritative context and recent room conversation as supporting evidence.
- Only owners, organization admins, and room editors may generate; browser reads remain participant-scoped.
- Keep generated records as standard editable tldraw frame, geo, arrow, binding, note, and text-capable records.
- Never replace or move existing human or generated canvas records.
- Use Supabase CLI 2.109.1 from `~/.local/share/supabase`; never the Homebrew 2.111.0 binary.

---

### Task 1: Strengthen The Flow Contract

**Files:**
- Modify: `packages/contracts/src/user-flow.ts`
- Modify: `packages/contracts/src/user-flow.test.ts`

**Interfaces:**
- Consumes: `FlowDocumentSchema` input from provider output and materialized RPC rows.
- Produces: the same `FlowDocumentSchema`, now requiring every node to be reachable from the sole Start and at least one End to be reachable.

- [ ] **Step 1: Add failing reachability tests**

```ts
expect(() => FlowDocumentSchema.parse(disconnectedDocument)).toThrow("reachable")
expect(() => FlowDocumentSchema.parse(noReachableEndDocument)).toThrow("end")
```

- [ ] **Step 2: Run the focused contract test and confirm failure**

```bash
pnpm --filter @meld/contracts test -- user-flow.test.ts
```

- [ ] **Step 3: Traverse from Start and reject unreachable nodes or an unreachable End**

```ts
const reachable = new Set<string>();
const queue = starts.length === 1 ? [starts[0].id] : [];
while (queue.length) {
  const current = queue.shift()!;
  if (reachable.has(current)) continue;
  reachable.add(current);
  queue.push(...(adjacency.get(current) ?? []));
}
```

- [ ] **Step 4: Run all contract tests and typecheck**

```bash
pnpm --filter @meld/contracts test
pnpm --filter @meld/contracts typecheck
```

---

### Task 2: Make SQL Forward-Safe And Recoverable

**Files:**
- Modify: `supabase/migrations/202608080005_prd_section_assistance.sql`
- Create: `supabase/migrations/202608100000_user_flow_task_kind.sql`
- Modify: `supabase/migrations/202608100001_user_flow_generation.sql`
- Create: `supabase/migrations/202608100002_user_flow_generation_recovery.sql`
- Modify: `supabase/tests/hydrate_existing_prd.test.sql`
- Create: `supabase/tests/user_flow_generation.test.sql`
- Modify: `apps/gateway/src/server.integration.test.ts`

**Interfaces:**
- Produces: `list_unapplied_user_flow_generations(target_room_id uuid)` returning safe materialized rows initiated by the caller.
- Produces: forward replacement of `hydrate_authorized_room_context` that attaches current PRD data for `user_flow_generate`.

- [ ] **Step 1: Add pgTAP and gateway assertions for hydration, authorization, materialization, and recovery reads**

```sql
select results_eq(
  $$ select (public.hydrate_authorized_room_context(:'task_id', :'device_id')->'context') ? 'existingPrd' $$,
  array[true],
  'user flow hydration includes the current PRD'
);
```

- [ ] **Step 2: Move enum creation into its own migration and remove the historical edit**

```sql
alter type public.ai_task_kind add value if not exists 'user_flow_generate';
```

- [ ] **Step 3: Add the forward hydration replacement and caller-scoped recovery RPC**

```sql
where generation.room_id = target_room_id
  and generation.initiating_user_id = auth.uid()
  and public.is_room_participant(generation.room_id)
order by generation.created_at, generation.task_id;
```

- [ ] **Step 4: Run SQL static checks and pinned-CLI database tests**

```bash
pnpm test:sql
PATH="$HOME/.local/share/supabase:$PATH" DOCKER_HOST=unix:///var/run/docker.sock supabase test db
```

---

### Task 3: Correct Server Actions And Polling

**Files:**
- Modify: `apps/web/src/features/canvas/user-flow-generation.ts`
- Create: `apps/web/src/features/canvas/user-flow-generation.test.ts`
- Modify: `apps/web/src/features/canvas/use-user-flow-generation.ts`
- Create: `apps/web/src/features/canvas/use-user-flow-generation.test.tsx`

**Interfaces:**
- Produces: `listUnappliedUserFlowGenerations(roomId)` for mount-time recovery.
- Produces: terminal-aware polling that stops after success, any terminal status, unmount, or a bounded materialization grace period.

- [ ] **Step 1: Add action tests for strict context readiness and safe recovery parsing**

```ts
expect(await generateUserFlow({ roomId })).toEqual({
  status: "needs_context",
  question: USER_FLOW_CONTEXT_QUESTION,
});
```

- [ ] **Step 2: Add fake-timer hook tests for recovery, all terminal states, timeout, and exactly-once application**

```ts
await vi.advanceTimersByTimeAsync(2_000);
expect(onGenerationReady).toHaveBeenCalledTimes(1);
```

- [ ] **Step 3: Require goal/start/outcome context rather than any ten-character message**

```ts
const hasContext = parsed.data.clarification || hasPrd || hasStructuredConversationContext(messages);
```

- [ ] **Step 4: Recover unapplied generations on mount and use `isTerminalTaskStatus` for polling**

```ts
if (task && isTerminalTaskStatus(task.status) && task.status !== "completed") {
  stopWithFailure();
}
```

- [ ] **Step 5: Run focused web tests and typecheck**

```bash
pnpm --filter @meld/web test -- user-flow-generation.test.ts use-user-flow-generation.test.tsx
pnpm --filter @meld/web typecheck
```

---

### Task 4: Build Bound, Legible, Non-Overlapping Canvas Records

**Files:**
- Modify: `apps/web/src/features/canvas/flow-document-to-tldraw.ts`
- Modify: `apps/web/src/features/canvas/flow-document-to-tldraw.test.ts`
- Modify: `apps/web/src/features/canvas/user-flow-trial-canvas.tsx`
- Create: `apps/web/src/features/canvas/user-flow-generation-controls.test.tsx`
- Modify: `apps/web/src/features/canvas/user-flow-trial-canvas.test.tsx`

**Interfaces:**
- Produces: mapper output containing frame children, bound arrows, provenance, summary, and open-question notes.
- Produces: `findGeneratedFlowOrigin(editor, width, height)` that chooses an unoccupied page-space origin.

- [ ] **Step 1: Add mapper tests for bindings, frame parenting, provenance, questions, dynamic height, and separate placement**

```ts
expect(records.filter((record) => record.typeName === "binding")).toHaveLength(document.edges.length * 2);
expect(questionNotes).toHaveLength(document.openQuestions.length);
```

- [ ] **Step 2: Generate arrow bindings and parent arrows inside the frame**

```ts
ArrowBindingUtil.create({
  fromId: arrow.id,
  toId: nodeShape.id,
  props: { terminal: "start", normalizedAnchor: { x: 1, y: 0.5 }, isExact: false, isPrecise: false },
});
```

- [ ] **Step 3: Render provenance, summary, timestamp, and open questions with standard records**

```ts
const provenance = `Agent-generated Draft · ${new Date(createdAt).toLocaleString()}`;
```

- [ ] **Step 4: Derive node height from bounded text and locate open canvas space before insertion**

```ts
const height = Math.max(MIN_NODE_HEIGHT, estimateTextHeight(label, NODE_WIDTH));
```

- [ ] **Step 5: Run all canvas tests, typecheck, lint, and Astryx checks**

```bash
pnpm --filter @meld/web test -- apps/web/src/features/canvas
pnpm --filter @meld/web typecheck
pnpm --filter @meld/web lint
pnpm check:astryx
```

---

### Task 5: Full Verification And Local Recovery

**Files:**
- Modify: `e2e/user-flow-trial.spec.ts`
- Modify: `docs/design/reports/2026-08-10-tldraw-trial-spike.md`

**Interfaces:**
- Verifies: generation, clarification, recovery, regeneration placement, binding behavior, collaboration, and viewer denial.

- [ ] **Step 1: Add browser assertions for two generations, movement with bound arrows, and recovery after reload**

- [ ] **Step 2: Run repository test and build gates with Node 22.23.2**

```bash
PATH="/Users/maxuser/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm test
PATH="/Users/maxuser/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm typecheck
PATH="/Users/maxuser/.nvm/versions/node/v22.23.2/bin:$PATH" pnpm build
```

- [ ] **Step 3: Reset with the pinned Supabase CLI and include seed data**

```bash
PATH="$HOME/.local/share/supabase:$PATH" DOCKER_HOST=unix:///var/run/docker.sock supabase db reset
```

- [ ] **Step 4: Verify migrations, storage bucket, web health, and onboarding logo upload**

```bash
PATH="$HOME/.local/share/supabase:$PATH" supabase status
curl -f http://127.0.0.1:3000/sign-in
```

- [ ] **Step 5: Record exact verification evidence and commit the corrections**

```bash
git add packages/contracts apps/connector apps/gateway apps/web supabase e2e docs
git commit -m "fix(user-flow): complete durable editable generation"
```
