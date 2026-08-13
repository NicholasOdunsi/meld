# User Flow Generation Navigation and Glow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Carry an active user-flow task through server navigation and show a pulsing pink perimeter from destination loading until generated shapes are inserted or generation fails.

**Architecture:** Extend `RoomPageData` with active user-flow task IDs derived from the existing room task projection. Pass the first ID through the dynamic User Flows loader and canvas-session loader into `useUserFlowGeneration`, which initializes its polling state from that server-provided ID. Client task context remains a fallback, not the primary cross-navigation transport.

**Tech Stack:** Next.js App Router, React, TypeScript, Vitest, Testing Library, CSS Modules, Astryx tokens, tldraw.

## Global Constraints

- The pink edge starts when the User Flows destination begins rendering, including dynamic import and canvas-session connection.
- The edge remains while generation is queued or running and disappears only after shapes are inserted or generation fails.
- Task IDs must not be added to the URL.
- The edge must not intercept canvas controls and must honor reduced-motion preferences.
- Preserve unrelated dirty-worktree changes.

---

### Task 1: Add active user-flow tasks to server room data

**Files:**
- Modify: `apps/web/src/features/rooms/backend.ts`
- Modify: `apps/web/src/features/rooms/fake-backend.ts`
- Modify: `apps/web/src/features/rooms/supabase-backend.ts`
- Test: `apps/web/src/features/rooms/e2e-fake.test.ts`
- Test: `apps/web/src/features/rooms/supabase-backend.test.ts`

**Interfaces:**
- Produces: `RoomPageData.activeUserFlowTaskIds: string[]`
- Consumes: the existing `RoomTaskStatus[]` projection loaded by both backends.

- [ ] **Step 1: Write failing backend assertions**

Add a running `user_flow_generate` status beside the PRD task in each backend fixture and assert:

```ts
expect(page?.activeUserFlowTaskIds).toEqual(["user-flow-task-running"]);
```

Also include a completed user-flow task and assert it is excluded.

- [ ] **Step 2: Run backend tests and confirm the missing property failure**

```bash
pnpm --filter @meld/web exec vitest run src/features/rooms/e2e-fake.test.ts src/features/rooms/supabase-backend.test.ts
```

- [ ] **Step 3: Extend the contract and both projections**

Add the field to `RoomPageData`, then compute it in each backend:

```ts
const activeUserFlowTaskIds = taskStatuses
  .filter(
    (task) =>
      task.kind === "user_flow_generate" &&
      !isTerminalTaskStatus(task.status),
  )
  .map((task) => task.taskId);
```

Return `activeUserFlowTaskIds` with the existing `activePrdTaskIds`.

- [ ] **Step 4: Run backend tests and confirm they pass**

Run the Task 1 command. Expected: PASS.

### Task 2: Carry the task through the room page and loading surfaces

**Files:**
- Modify: `apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.tsx`
- Test: `apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.test.tsx`
- Modify: `apps/web/src/features/canvas/user-flow-trial-tab-loader.tsx`
- Modify: `apps/web/src/features/canvas/user-flow-trial-tab.tsx`
- Test: `apps/web/src/features/canvas/user-flow-trial-tab.test.tsx`

**Interfaces:**
- Produces: `initialGenerationTaskId?: string | null` on `UserFlowTrialTab` and `UserFlowTrialCanvas`.
- Consumes: `RoomPageData.activeUserFlowTaskIds[0]`.

- [ ] **Step 1: Write failing page and loader tests**

Capture the mocked loader props in the page test and assert:

```ts
expect(mocks.userFlowTrialTab).toHaveBeenCalledWith(
  expect.objectContaining({ initialGenerationTaskId: "user-flow-task-running" }),
  undefined,
);
```

In the tab test, render with an unresolved canvas-session promise and `initialGenerationTaskId`, then assert the loading host has `data-generating="true"` and the glow class.

- [ ] **Step 2: Run the page and tab tests and confirm failure**

```bash
pnpm --filter @meld/web exec vitest run src/app/'(app)'/'[workspaceId]'/rooms/'[roomId]'/page.test.tsx src/features/canvas/user-flow-trial-tab.test.tsx
```

- [ ] **Step 3: Pass the server task ID and wrap all loading stages**

Pass the first active ID from the page:

```tsx
<UserFlowTrialTab
  {...existingProps}
  initialGenerationTaskId={data.activeUserFlowTaskIds[0] ?? null}
/>
```

Export a typed wrapper from `user-flow-trial-tab-loader.tsx`. While its dynamic child has not mounted, apply `glowStyles.glow` to a relative, overflow-hidden `VStack`. The dynamically loaded component calls `onClientReady()` from a mount effect; its canvas-session loading `VStack` simultaneously carries the same glow, preventing a visual gap.

- [ ] **Step 4: Run page and tab tests and confirm they pass**

Run the Task 2 command. Expected: PASS.

### Task 3: Initialize generation polling from the server task ID

**Files:**
- Modify: `apps/web/src/features/canvas/use-user-flow-generation.ts`
- Test: `apps/web/src/features/canvas/use-user-flow-generation.test.tsx`
- Modify: `apps/web/src/features/canvas/user-flow-trial-canvas.tsx`
- Test: `apps/web/src/features/canvas/user-flow-trial-canvas.test.tsx`

**Interfaces:**
- Consumes: `initialTaskId?: string | null` in `useUserFlowGeneration`.
- Produces: initial `{ taskId, status: "running" }` when the server provides an active task; existing provider adoption remains fallback behavior.

- [ ] **Step 1: Write failing initial-task polling tests**

Render the hook with `initialTaskId: taskId`, without provider statuses, and assert before advancing timers:

```ts
expect(hook.result.current).toMatchObject({ taskId, status: "running" });
```

Advance two seconds, return the materialized generation, and assert `onGenerationReady` runs once and status becomes `completed`. In the canvas test, assert `initialGenerationTaskId` is forwarded into the hook mock.

- [ ] **Step 2: Run hook and canvas tests and confirm failure**

```bash
pnpm --filter @meld/web exec vitest run src/features/canvas/use-user-flow-generation.test.tsx src/features/canvas/user-flow-trial-canvas.test.tsx
```

- [ ] **Step 3: Initialize the hook and forward the prop**

Add the hook option and state initializers:

```ts
initialTaskId?: string | null;
const [status, setStatus] = useState<Status>(initialTaskId ? "running" : "idle");
const [taskId, setTaskId] = useState<string | null>(initialTaskId ?? null);
```

Skip the one-shot unapplied recovery while a task ID is already being polled. Pass `initialGenerationTaskId` from `UserFlowTrialTab` to `UserFlowTrialCanvas`, then as `initialTaskId` into the hook.

- [ ] **Step 4: Run hook and canvas tests and confirm they pass**

Run the Task 3 command. Expected: PASS.

### Task 4: Verify the complete lifecycle

**Files:**
- Test: all files listed in Tasks 1-3 plus proposal and room-status tests.

**Interfaces:**
- Verifies: accepted proposal -> server active task ID -> destination loading glow -> hook polling -> shape insertion -> glow removal.

- [ ] **Step 1: Run the focused suite**

```bash
pnpm --filter @meld/web exec vitest run src/features/rooms/e2e-fake.test.ts src/features/rooms/supabase-backend.test.ts src/app/'(app)'/'[workspaceId]'/rooms/'[roomId]'/page.test.tsx src/features/rooms/components/conversation.test.tsx src/features/prd/components/room-task-status-provider.test.tsx src/features/canvas/user-flow-trial-tab.test.tsx src/features/canvas/use-user-flow-generation.test.tsx src/features/canvas/user-flow-trial-canvas.test.tsx
```

- [ ] **Step 2: Run type and lint checks**

```bash
pnpm --filter @meld/web exec tsc --noEmit --pretty false
pnpm --filter @meld/web exec eslint src/features/rooms/backend.ts src/features/rooms/fake-backend.ts src/features/rooms/supabase-backend.ts src/app/'(app)'/'[workspaceId]'/rooms/'[roomId]'/page.tsx src/features/canvas/user-flow-trial-tab-loader.tsx src/features/canvas/user-flow-trial-tab.tsx src/features/canvas/use-user-flow-generation.ts src/features/canvas/user-flow-trial-canvas.tsx
```

- [ ] **Step 3: Inspect final diff and local task recovery**

```bash
git diff --check
git diff -- apps/web/src/features/rooms/backend.ts apps/web/src/features/rooms/fake-backend.ts apps/web/src/features/rooms/supabase-backend.ts apps/web/src/app/'(app)'/'[workspaceId]'/rooms/'[roomId]'/page.tsx apps/web/src/features/canvas/user-flow-trial-tab-loader.tsx apps/web/src/features/canvas/user-flow-trial-tab.tsx apps/web/src/features/canvas/use-user-flow-generation.ts apps/web/src/features/canvas/user-flow-trial-canvas.tsx
```

Expected: no whitespace errors; the active server task ID reaches every destination layer and no task ID is added to the URL.
