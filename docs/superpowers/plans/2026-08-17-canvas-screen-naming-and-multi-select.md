# Canvas Screen Naming + Multi-Screen Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generated screens get a real page name that relabels their canvas frame, and selecting one or more screens/sketches on the canvas surfaces removable composer chips that fan out one generation task per screen (each following its own sketch).

**Architecture:** Feature 1 threads a model-emitted `name` through the payload schema → connector response schema/prompt → the `materialize_design_screen_generate` SQL trigger, which writes it to `design_screens.name` (guarded so it never clobbers a hand-set name). Feature 2 turns the single-frame canvas selection into an array, renders a removable chip per selected screen in the composer, and refactors the generation hook to track a set of in-flight tasks so `submit` can fan out one task per screen.

**Tech Stack:** TypeScript, Next.js 16 / React 19, tldraw 5.3, zod 4, Supabase/Postgres (plpgsql), Vitest, Playwright, `@astryxdesign/core` design system, pnpm/turbo monorepo.

## Global Constraints

- `design_screens.name`: `text not null check (char_length(btrim(name)) between 1 and 120)` — any value written must be non-empty after trim and ≤120 chars (`supabase/migrations/202608130006_design_screens.sql:7`).
- Feature flag: everything lives behind the existing dev-only canvas trial (`MELD_USER_FLOW_TRIAL_ENABLED=true` + `NODE_ENV !== "production"`). No production exposure.
- Tests are colocated (enforced by `scripts/check-test-colocation.mjs`): a `foo.ts` change ships with `foo.test.ts` next to it.
- Placeholder-name guard (Feature 1): a screen's name is only overwritten by generation when its current name is exactly the default `'Screen'` (trimmed). Flow-seeded and user-typed names are preserved.
- Fan-out (Feature 2): N independent `generateDesignScreen` calls — one per selected screen, each with its own serialized sketch. No all-or-nothing rollback.
- Sketch selection stays a coarse positional layout (`serializeSketch`); no raw-image/vision path.
- Commit after each task with a Conventional-Commits message; end every commit message with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Verify with `pnpm --filter <pkg> exec vitest run <file>` for unit tests, `supabase test db` for SQL, and `playwright test --config playwright.canvas-trial.config.ts` for e2e.

---

## Task 1: Add a `name` field to the design-screen payload schema

**Files:**
- Modify: `packages/prototype/src/screen-payload.ts` (add `name` to `DesignScreenPayloadSchema`, ~line 87-95)
- Test: `packages/prototype/src/screen-payload.test.ts` (create if absent; else append)

**Interfaces:**
- Produces: `DesignScreenPayloadSchema` now parses an optional `name: string` (trimmed, 1-120). `DesignScreenPayload` type gains `name?: string`.

- [ ] **Step 1: Write the failing test**

Append to `packages/prototype/src/screen-payload.test.ts` (create with the imports if the file doesn't exist):

```ts
import { describe, expect, it } from "vitest";
import { DesignScreenPayloadSchema } from "./screen-payload";

const base = { markup: "<main></main>", styles: "", script: null, actions: [] };

describe("DesignScreenPayloadSchema name", () => {
  it("accepts and trims a page name", () => {
    const parsed = DesignScreenPayloadSchema.parse({ ...base, name: "  Vehicle Pool  " });
    expect(parsed.name).toBe("Vehicle Pool");
  });
  it("stays optional for legacy payloads without a name", () => {
    const parsed = DesignScreenPayloadSchema.parse(base);
    expect(parsed.name).toBeUndefined();
  });
  it("rejects a name longer than 120 chars", () => {
    const result = DesignScreenPayloadSchema.safeParse({ ...base, name: "x".repeat(121) });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @meld/prototype exec vitest run src/screen-payload.test.ts`
Expected: FAIL — `name` is stripped/rejected by `.strict()` so `parsed.name` is undefined on the first test (or the whole parse throws on the unknown key).

- [ ] **Step 3: Add the field**

In `packages/prototype/src/screen-payload.ts`, inside `DesignScreenPayloadSchema` (the `.object({ ... })` starting line 80), add after the `screenKey` block (before `formFactor`, ~line 92):

```ts
    // The screen's human display name (the page title). Optional so
    // already-persisted payloads, e2e fakes, and hand-written literals that
    // predate named screens still parse; the model-facing requirement (every
    // generated screen must emit one) is enforced by the connector's response
    // schema, not here. Bounds mirror design_screens.name (1-120, trimmed).
    name: z.string().trim().min(1).max(120).optional(),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @meld/prototype exec vitest run src/screen-payload.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter @meld/prototype exec tsc --noEmit`
```bash
git add packages/prototype/src/screen-payload.ts packages/prototype/src/screen-payload.test.ts
git commit -m "feat(prototype): add optional page name to design screen payload

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Emit a page name from the connector (response schema + prompt)

**Files:**
- Modify: `apps/connector/src/tasks/design-screen-generate-prompt.ts` (response schema per-screen `required` + `properties`, ~lines 149-160; prompt rule near line 22)
- Test: `apps/connector/src/tasks/design-screen-generate-prompt.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `DESIGN_SCREEN_GENERATE_RESPONSE_SCHEMA` requires a per-screen `name` (string, 1-120). The system prompt instructs the model to emit it.

- [ ] **Step 1: Write the failing test**

Append to `apps/connector/src/tasks/design-screen-generate-prompt.test.ts`:

```ts
it("requires a per-screen name in the response schema", () => {
  const screen = (
    DESIGN_SCREEN_GENERATE_RESPONSE_SCHEMA.properties as {
      screens: { items: { required: string[]; properties: Record<string, unknown> } };
    }
  ).screens.items;
  expect(screen.required).toContain("name");
  expect(screen.properties).toHaveProperty("name");
});
```

Ensure `DESIGN_SCREEN_GENERATE_RESPONSE_SCHEMA` is imported at the top of the test file (it is exported from the prompt module — add to the existing import if not already present).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @meld/connector exec vitest run src/tasks/design-screen-generate-prompt.test.ts`
Expected: FAIL — `required` does not contain `"name"`.

- [ ] **Step 3: Add `name` to the schema**

In `apps/connector/src/tasks/design-screen-generate-prompt.ts`:

a) Add `"name"` to the per-screen `required` array (currently lines 149-157), after `"screenKey"`:

```ts
        required: [
          "screenKey",
          "name",
          "formFactor",
          "markup",
          "styles",
          "script",
          "actions",
          "layout",
        ],
```

b) Add the property inside per-screen `properties` (after the `screenKey` property, ~line 159):

```ts
          name: { type: "string", minLength: 1, maxLength: 120 },
```

c) Add a prompt rule near the existing screenKey instruction (line ~22), so the model produces a display name distinct from the slug:

```ts
- Give each screen a short human `name` -- the page's real title in Title Case (e.g. "Vehicle Pool", "Checkout — Confirm"), 1-120 chars. This is the display label, distinct from the lowercase `screenKey` slug used for linking.
```

- [ ] **Step 4: Run test + full prompt suite**

Run: `pnpm --filter @meld/connector exec vitest run src/tasks/design-screen-generate-prompt.test.ts`
Expected: PASS. (If any golden-prompt snapshot in the same file now includes the new rule line, update the snapshot to match.)

- [ ] **Step 5: Commit**

```bash
git add apps/connector/src/tasks/design-screen-generate-prompt.ts apps/connector/src/tasks/design-screen-generate-prompt.test.ts
git commit -m "feat(connector): require a per-screen display name in generation output

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Persist the generated name to the screen row (SQL migration)

**Files:**
- Create: `supabase/migrations/20260817000001_design_screen_name.sql`
- Test: `supabase/tests/design_screen_name.test.sql` (create; follows the existing `supabase/tests/*.test.sql` pgTAP-style pattern used by `supabase test db`)

**Interfaces:**
- Consumes: `result_json.payload.screens[].name` (Task 2 output).
- Produces: `materialize_design_screen_generate` now writes `design_screens.name` for new siblings (model name → slug fallback) and updates target/existing screens whose current name is exactly `'Screen'`.

- [ ] **Step 1: Write the failing SQL test**

Create `supabase/tests/design_screen_name.test.sql`. Model it on an existing screen-generation SQL test (read `supabase/tests/user_flow_generation.test.sql` for the harness helpers/rollback pattern). It must, within a transaction:
1. seed a room + a screen created with name `'Screen'` (via `create_design_screen`),
2. insert a completed `ai_tasks` row of kind `design_screen_generate` whose `result_json` is `{"payload":{"screens":[{"screenKey":"vehicle_pool","name":"Vehicle Pool","formFactor":"mobile","markup":"<main data-meld-slot></main>","styles":"","script":null,"actions":[],"layout":null}]}}` linked to that screen via `design_screen_generations`,
3. fire the materialize path (matching how the existing tests trigger it — the trigger runs on the task-status transition; reuse that helper),
4. assert the screen's `name` is now `'Vehicle Pool'`.
Add a second case: a screen pre-named `'Login'` (not the placeholder) must remain `'Login'` after the same materialize. Add a third: a forward-referenced sibling (screenKey not matching any row) is inserted with `name = 'Vehicle Pool'` from the payload.

- [ ] **Step 2: Run test to verify it fails**

Run: `supabase test db`
Expected: FAIL — the target screen keeps `'Screen'` (no name UPDATE exists yet).

- [ ] **Step 3: Write the migration**

Copy the full `create or replace function public.materialize_design_screen_generate()` body from `supabase/migrations/202608150013_materialize_layouts.sql` into the new migration (it is the live definition; redefining is the established pattern — see how `202608150011`/`202608150013` each re-`create or replace` it). Apply exactly two edits inside the per-screen loop:

a) **New-sibling INSERT** — replace the slug-only `name` value (currently `coalesce(nullif(initcap(replace(screen_key_val, '-', ' ')), ''), 'Screen ' || (idx + 1))`, ~lines 161-164) with:

```sql
        coalesce(
          nullif(btrim(elem ->> 'name'), ''),
          nullif(initcap(replace(screen_key_val, '-', ' ')), ''),
          'Screen ' || (idx + 1)
        ),
```

b) **Target / existing screen** — after the version write for the resolved screen (alongside the `layout_id` update, ~lines 274-290), add:

```sql
      update public.design_screens
         set name = nullif(btrim(elem ->> 'name'), '')
       where id = target_screen.id
         and btrim(name) = 'Screen'
         and nullif(btrim(elem ->> 'name'), '') is not null;
```

(`target_screen.id` is whatever the element resolved to — the idx-0 target by `generation.screen_id` or an existing sibling matched by `screen_key`; both flow through the same `target_screen` variable in the loop.)

- [ ] **Step 4: Run test to verify it passes**

Run: `supabase test db`
Expected: PASS (all three cases).

- [ ] **Step 5: Arity/parity + commit**

Run: `pnpm check:sql-arities && pnpm check:sql-rooms`
Expected: PASS (function signature unchanged — this is a `create or replace` of an existing 0-arg trigger fn).
```bash
git add supabase/migrations/20260817000001_design_screen_name.sql supabase/tests/design_screen_name.test.sql
git commit -m "feat(design): persist generated page name to the screen row

Only overwrites the default 'Screen' placeholder, so flow-seeded and
user-typed names are preserved.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Broaden canvas selection to an array of screens

**Files:**
- Modify: `apps/web/src/features/canvas/use-canvas-selection.ts` (return type + `canvasSketchSelection` + hook)
- Test: `apps/web/src/features/canvas/use-canvas-selection.test.ts`

**Interfaces:**
- Produces:
  - `type CanvasScreenSelection = { targetScreenId: string; frame: Bounds; sketchShapes: SketchShape[] }`
  - `canvasSketchSelection(editor: SelectionEditor): CanvasScreenSelection[]` (was `CanvasSketchSelection | null`)
  - `useCanvasSketchSelection(editorRef, editorReady): CanvasScreenSelection[]`
  - Old single-object `CanvasSketchSelection` is removed; consumers (Task 6) use the array.

- [ ] **Step 1: Rewrite the tests (failing)**

Replace the body of `apps/web/src/features/canvas/use-canvas-selection.test.ts` describe block with array-shaped expectations. Keep the `editor()` helper and shape fixtures; add a second frame:

```ts
const frameShape2 = { id: "shape:screen-s2", type: "frame", meta: { meldScreenId: "s2" } };
const frame2Bounds: Bounds = { x: 400, y: 0, w: 300, h: 900 };

describe("canvasSketchSelection", () => {
  it("returns one entry per selected frame with its contained sketch shapes", () => {
    const r = canvasSketchSelection(
      editor([frameShape], [frameShape, sketch, flow], {
        "shape:screen-s1": frameBounds,
        "shape:geo1": { x: 20, y: 20, w: 40, h: 40 },
        "shape:flow1": { x: 10, y: 10, w: 20, h: 20 },
      }),
    );
    expect(r).toHaveLength(1);
    expect(r[0].targetScreenId).toBe("s1");
    expect(r[0].sketchShapes.map((s) => s.kind)).toEqual(["rectangle"]);
    expect(r[0].frame).toEqual(frameBounds);
  });

  it("returns two entries when two frames are selected, ordered by frame.x", () => {
    const r = canvasSketchSelection(
      editor([frameShape2, frameShape], [frameShape, frameShape2], {
        "shape:screen-s1": frameBounds,
        "shape:screen-s2": frame2Bounds,
      }),
    );
    expect(r.map((e) => e.targetScreenId)).toEqual(["s1", "s2"]);
  });

  it("resolves a selected loose sketch shape to its containing screen even when the frame is not selected", () => {
    const r = canvasSketchSelection(
      editor([sketch], [frameShape, sketch], {
        "shape:screen-s1": frameBounds,
        "shape:geo1": { x: 20, y: 20, w: 40, h: 40 },
      }),
    );
    expect(r).toHaveLength(1);
    expect(r[0].targetScreenId).toBe("s1");
    expect(r[0].sketchShapes).toHaveLength(1);
  });

  it("returns empty when nothing resolves to a screen", () => {
    expect(
      canvasSketchSelection(editor([sketch], [sketch], { "shape:geo1": { x: 0, y: 0, w: 10, h: 10 } })),
    ).toEqual([]);
  });

  it("dedupes when both a frame and a sketch inside it are selected", () => {
    const r = canvasSketchSelection(
      editor([frameShape, sketch], [frameShape, sketch], {
        "shape:screen-s1": frameBounds,
        "shape:geo1": { x: 20, y: 20, w: 40, h: 40 },
      }),
    );
    expect(r).toHaveLength(1);
    expect(r[0].targetScreenId).toBe("s1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas/use-canvas-selection.test.ts`
Expected: FAIL — current impl returns a single object / null, not arrays.

- [ ] **Step 3: Rewrite the resolver**

In `apps/web/src/features/canvas/use-canvas-selection.ts`:

Replace the `CanvasSketchSelection` type with:
```ts
export type CanvasScreenSelection = {
  targetScreenId: string;
  frame: Bounds;
  sketchShapes: SketchShape[];
};
```

Replace `canvasSketchSelection` with:
```ts
// Pure: given a minimal editor-shaped interface, return one entry per screen
// the user has targeted -- a screen is targeted when its frame is selected OR
// when a loose (non-frame, non-flow) shape whose center sits inside that frame
// is selected. Each entry carries the sketch shapes contained in that frame.
export function canvasSketchSelection(
  editor: SelectionEditor,
): CanvasScreenSelection[] {
  const selected = editor.getSelectedShapes();

  // All screen frames on the page, with bounds, so a selected loose shape can
  // be attributed to the frame that contains it.
  const allFrames: { id: string; screenId: string; bounds: Bounds }[] = [];
  for (const shape of editor.getCurrentPageShapes()) {
    if (!isScreenFrame(shape)) continue;
    const bounds = editor.getShapePageBounds(shape.id);
    if (bounds) allFrames.push({ id: shape.id, screenId: shape.meta.meldScreenId as string, bounds });
  }

  const targetFrameIds = new Set<string>();
  for (const shape of selected) {
    if (isScreenFrame(shape)) {
      targetFrameIds.add(shape.id);
      continue;
    }
    if (isFlowShape(shape)) continue;
    const bounds = editor.getShapePageBounds(shape.id);
    if (!bounds) continue;
    const container = allFrames.find((f) => shapeCenterInFrame(bounds, f.bounds));
    if (container) targetFrameIds.add(container.id);
  }

  const targets = allFrames
    .filter((f) => targetFrameIds.has(f.id))
    .sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y);

  return targets.map((target) => {
    const sketchShapes: SketchShape[] = [];
    for (const shape of editor.getCurrentPageShapes()) {
      if (shape.id === target.id) continue;
      if (isScreenFrame(shape) || isFlowShape(shape)) continue;
      const bounds = editor.getShapePageBounds(shape.id);
      if (!bounds) continue;
      if (!shapeCenterInFrame(bounds, target.bounds)) continue;
      sketchShapes.push({
        kind: tldrawTypeToSketchKind(shape.type, shape.props),
        x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h,
        text: shapeText(shape),
      });
    }
    return { targetScreenId: target.screenId, frame: target.bounds, sketchShapes };
  });
}
```

Update the hook's return type + tracked function to return `CanvasScreenSelection[]` (return `[]` instead of `null` in the guard branches):
```ts
export function useCanvasSketchSelection(
  editorRef: RefObject<Editor | null>,
  editorReady: boolean,
): CanvasScreenSelection[] {
  return useValue(
    "canvas-sketch-selection",
    () => {
      const editor = editorRef.current;
      if (!editor) return [];
      const selectionEditor = editor as unknown as SelectionEditor;
      if (typeof selectionEditor.getSelectedShapes !== "function") return [];
      return canvasSketchSelection(selectionEditor);
    },
    [editorRef, editorReady],
  );
}
```
(Keep the long explanatory `editorReady` comment above the hook.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas/use-canvas-selection.test.ts`
Expected: PASS (5 tests). Typecheck will fail in `screen-composer.tsx` (consumer) — expected; fixed in Task 6.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/canvas/use-canvas-selection.ts apps/web/src/features/canvas/use-canvas-selection.test.ts
git commit -m "feat(canvas): resolve multi-screen selection (frames + loose sketches)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Track multiple in-flight generations in the hook

**Files:**
- Modify: `apps/web/src/features/design/use-design-screen-generation.ts`
- Test: `apps/web/src/features/design/use-design-screen-generation.test.ts` (create if absent)

**Interfaces:**
- Consumes: `generateDesignScreen` (unchanged server action).
- Produces: hook returns `{ status, taskId, message, start, startMany, isGenerating, activeTaskIds }`.
  - `startMany(inputs: StartInput[]): Promise<void>` queues each input; every returned task id is tracked concurrently.
  - `isGenerating: boolean` = any active task.
  - `status`/`taskId` retained for back-compat (`status` = `"running"` while any active, else last terminal outcome; `taskId` = most recent).
  - `StartInput` = the existing `start` input object type (export it).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/features/design/use-design-screen-generation.test.ts`. Test the pure aggregation helper this task introduces (a `renderDream`-free unit — no React render needed):

```ts
import { describe, expect, it } from "vitest";
import { aggregateStatus } from "./use-design-screen-generation";

describe("aggregateStatus", () => {
  it("is running while any task is active", () => {
    expect(aggregateStatus(["t1"], null)).toBe("running");
  });
  it("falls back to the last terminal outcome when idle", () => {
    expect(aggregateStatus([], "completed")).toBe("completed");
    expect(aggregateStatus([], "failed")).toBe("failed");
    expect(aggregateStatus([], null)).toBe("idle");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @meld/web exec vitest run src/features/design/use-design-screen-generation.test.ts`
Expected: FAIL — `aggregateStatus` is not exported.

- [ ] **Step 3: Refactor the hook to a task set**

In `apps/web/src/features/design/use-design-screen-generation.ts`:

a) Export the input type and the aggregation helper:
```ts
export type StartInput = {
  screenId?: string;
  name?: string;
  instruction: string;
  provider?: Provider;
  model?: string;
  layout?: SketchLayout;
  context?: {
    existingScreens: { key: string; name: string }[];
    danglingTargets: string[];
    existingLayouts?: { key: string; name: string }[];
  };
};

export function aggregateStatus(
  activeTaskIds: string[],
  lastOutcome: "completed" | "failed" | null,
): Status {
  if (activeTaskIds.length > 0) return "running";
  return lastOutcome ?? "idle";
}
```

b) Replace the single `taskId` state with a set + last-outcome:
```ts
  const [activeTaskIds, setActiveTaskIds] = useState<string[]>([]);
  const [lastOutcome, setLastOutcome] = useState<"completed" | "failed" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const status = aggregateStatus(activeTaskIds, lastOutcome);
  const taskId = activeTaskIds[activeTaskIds.length - 1] ?? null;
```
Keep `delivered`, `roomStatusesRef`, `callbackRef` refs. Add a per-task attempts ref:
```ts
  const attemptsRef = useRef(new Map<string, { poll: number; materialize: number }>());
```

c) Update `deliver` to remove the task from the active set and record the outcome:
```ts
  const deliver = useCallback(async (generation: MaterializedGeneration) => {
    if (delivered.current.has(generation.taskId)) return;
    delivered.current.add(generation.taskId);
    try {
      await callbackRef.current?.();
      setLastOutcome("completed");
    } catch {
      delivered.current.delete(generation.taskId);
      setMessage("The generated screen could not be loaded. Try again.");
      setLastOutcome("failed");
    } finally {
      setActiveTaskIds((prev) => prev.filter((id) => id !== generation.taskId));
    }
  }, []);
```

d) A single `enqueue` helper both `start` and `startMany` share:
```ts
  const enqueue = useCallback(async (input: StartInput): Promise<GenerateDesignScreenResult | null> => {
    if (access !== "edit") return null;
    setMessage(null);
    const result = await generateDesignScreen({ roomId, ...input });
    if (result.status === "queued") {
      setActiveTaskIds((prev) => (prev.includes(result.taskId) ? prev : [...prev, result.taskId]));
      roomTaskStatus?.notifyQueued({ kind: "design_screen_generate", taskId: result.taskId });
    } else {
      setMessage(result.message);
      setLastOutcome("failed");
    }
    return result;
  }, [access, roomId, roomTaskStatus]);

  const start = useCallback((input: StartInput) => enqueue(input), [enqueue]);
  const startMany = useCallback(async (inputs: StartInput[]) => {
    await Promise.all(inputs.map((input) => enqueue(input)));
  }, [enqueue]);
```

e) Generalize the adoption effect (lines 81-103) to seed *all* active room task ids not already tracked:
```ts
  useEffect(() => {
    if (access !== "edit") return;
    const active = roomTaskStatus?.activeDesignScreenGenerationTaskIds ?? [];
    const fresh = active.filter((id) => !activeTaskIds.includes(id) && !delivered.current.has(id));
    if (fresh.length === 0) return;
    const timer = setTimeout(() => {
      setActiveTaskIds((prev) => [...prev, ...fresh.filter((id) => !prev.includes(id))]);
      notifyRoomTaskQueued?.();
    }, 0);
    return () => clearTimeout(timer);
  }, [access, roomTaskStatus?.activeDesignScreenGenerationTaskIds, notifyRoomTaskQueued, activeTaskIds]);
```

f) Generalize the poll effect (lines 143-179) to poll every active task each tick; key it on the joined id list:
```ts
  const activeKey = activeTaskIds.join(",");
  useEffect(() => {
    if (!activeKey || access !== "edit") return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      for (const id of activeKey.split(",")) {
        const task = roomStatusesRef.current.find((c) => c.taskId === id);
        if (task && isTerminalTaskStatus(task.status) && task.status !== "completed") {
          setMessage("Screen generation did not complete. Try again.");
          setLastOutcome("failed");
          setActiveTaskIds((prev) => prev.filter((x) => x !== id));
          continue;
        }
        const generation = await getDesignScreenGeneration(id);
        if (disposed) return;
        if (isMaterialized(generation)) { await deliver(generation); continue; }
        const a = attemptsRef.current.get(id) ?? { poll: 0, materialize: 0 };
        a.poll += 1;
        if (task?.status === "completed") a.materialize += 1;
        attemptsRef.current.set(id, a);
        if (a.poll >= MAX_POLL_ATTEMPTS || a.materialize >= MAX_MATERIALIZATION_ATTEMPTS) {
          setMessage("Screen generation did not finish in time. Try again.");
          setLastOutcome("failed");
          setActiveTaskIds((prev) => prev.filter((x) => x !== id));
        }
      }
      if (!disposed) timer = setTimeout(poll, POLL_INTERVAL_MS);
    };
    timer = setTimeout(poll, POLL_INTERVAL_MS);
    return () => { disposed = true; if (timer) clearTimeout(timer); };
  }, [access, deliver, activeKey]);
```

g) Update the return:
```ts
  return { status, taskId, message, start, startMany, isGenerating: activeTaskIds.length > 0, activeTaskIds };
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm --filter @meld/web exec vitest run src/features/design/use-design-screen-generation.test.ts`
Expected: PASS.
Run: `pnpm --filter @meld/web exec tsc --noEmit` (composer still consumes old shape — may error until Task 6; that's fine, note it).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/design/use-design-screen-generation.ts apps/web/src/features/design/use-design-screen-generation.test.ts
git commit -m "feat(design): track multiple in-flight screen generations (startMany)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Composer chips + fan-out

**Files:**
- Modify: `apps/web/src/features/design/components/screen-composer.tsx`
- Test: `apps/web/src/features/design/components/screen-composer.test.tsx` (create if absent; use `@testing-library/react`)

**Interfaces:**
- Consumes: `CanvasScreenSelection[]` (Task 4), `generation.startMany` + `isGenerating` (Task 5), `canvasScreens` (existing).
- Produces: composer renders one removable chip per selected screen and fans out generation on submit.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/features/design/components/screen-composer.test.tsx`. Render `ScreenComposer` with two selected screens and assert two named chips appear, and that clicking a chip's remove control drops it. (Mock `../use-design-screen-generation`, `../design-agent-transcript`, and `next/navigation` as the existing web component tests do — check a sibling `*.test.tsx` for the mock setup pattern.)

```tsx
it("renders a removable chip per selected screen, labelled by screen name", async () => {
  const selection = [
    { targetScreenId: "s1", frame: { x: 0, y: 0, w: 300, h: 900 }, sketchShapes: [{ kind: "rectangle", x: 1, y: 1, w: 1, h: 1, text: null }] },
    { targetScreenId: "s2", frame: { x: 400, y: 0, w: 300, h: 900 }, sketchShapes: [] },
  ];
  const canvasScreens = [
    { id: "s1", name: "Login", /* ...minimal CanvasScreen fields... */ },
    { id: "s2", name: "Dashboard" },
  ];
  render(<ScreenComposer roomId="r" access="edit" currentUserId="u" currentUserName="U"
    selection={selection as never} canvasScreens={canvasScreens as never} />);
  expect(await screen.findByText(/Login/)).toBeInTheDocument();
  expect(screen.getByText(/following your sketch \(1\)/)).toBeInTheDocument();
  expect(screen.getByText(/Dashboard/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /remove Dashboard/i }));
  expect(screen.queryByText(/Dashboard/)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @meld/web exec vitest run src/features/design/components/screen-composer.test.tsx`
Expected: FAIL — `selection` prop is still the single-object type; no chips render.

- [ ] **Step 3: Update the composer**

In `apps/web/src/features/design/components/screen-composer.tsx`:

a) Imports/prop:
```ts
import type { CanvasScreenSelection } from "@/features/canvas/use-canvas-selection";
```
Change the prop (line 103) to `selection?: CanvasScreenSelection[];` and the default (line 85) to `selection = []`.

b) Local dismiss state + effective targets (near the other `useState`s, ~line 123):
```ts
  const [dismissedScreenIds, setDismissedScreenIds] = useState<Set<string>>(new Set());
  const selectionKey = selection.map((s) => s.targetScreenId).join(",");
  useEffect(() => { setDismissedScreenIds(new Set()); }, [selectionKey]);
  const screenNameById = new Map(canvasScreens.map((s) => [s.id, s.name]));
  const effectiveTargets = selection.filter((s) => !dismissedScreenIds.has(s.targetScreenId));
```

c) Replace `isGenerating` derivation (lines 138-139) with the hook value:
```ts
  const isGenerating = generation.isGenerating;
```

d) `sketchLayout` (lines 189-191) is now per-target; delete the single-selection version and build layouts inside `submit`.

e) Rewrite `submit` (lines 237-275). Replace the single-vs-none branch with fan-out:
```ts
  function submit(instructionText: string) {
    const trimmed = instructionText.trim();
    if (!trimmed) return;
    setValue("");

    if (effectiveTargets.length === 0) {
      const optimistic: DesignAgentTurn = {
        taskId: `optimistic-${Date.now()}`, screenId: "", screenName: "Screen",
        userPrompt: trimmed, initiatedBy: currentUserId, taskStatus: "queued",
        screenState: "empty", currentVersionId: null, createdAt: new Date().toISOString(),
      };
      setTurns((prev) => [...prev, optimistic]);
      void generation.start({ instruction: trimmed, provider: routing?.provider, model: routing?.model, context: generationContext })
        .then(() => void refreshTurns());
      return;
    }

    const optimistic = effectiveTargets.map((t, i): DesignAgentTurn => ({
      taskId: `optimistic-${Date.now()}-${i}`,
      screenId: t.targetScreenId,
      screenName: screenNameById.get(t.targetScreenId) ?? "Screen",
      userPrompt: trimmed, initiatedBy: currentUserId, taskStatus: "queued",
      screenState: "empty", currentVersionId: null, createdAt: new Date().toISOString(),
    }));
    setTurns((prev) => [...prev, ...optimistic]);

    void generation.startMany(effectiveTargets.map((t) => ({
      screenId: t.targetScreenId,
      instruction: trimmed,
      provider: routing?.provider,
      model: routing?.model,
      layout: t.sketchShapes.length ? serializeSketch(t.sketchShapes, t.frame) : undefined,
      context: generationContext,
    }))).then(() => void refreshTurns());
  }
```

f) Replace the single `Badge` (lines 317-323) with a chip row:
```tsx
        {effectiveTargets.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--spacing-1)" }}>
            {effectiveTargets.map((t) => {
              const label = screenNameById.get(t.targetScreenId) ?? "Screen";
              const suffix = t.sketchShapes.length ? ` · following your sketch (${t.sketchShapes.length})` : "";
              return (
                <span key={t.targetScreenId} style={{ display: "inline-flex", alignItems: "center", gap: "var(--spacing-1)" }}>
                  <Badge variant="info" icon="▦" label={`Editing: ${label}${suffix}`} />
                  <button type="button" aria-label={`remove ${label}`}
                    onClick={() => setDismissedScreenIds((prev) => new Set(prev).add(t.targetScreenId))}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                    <Icon icon={ArrowUp} size="xsm" />
                  </button>
                </span>
              );
            })}
          </div>
        ) : null}
```
(If `@astryxdesign/core` exposes a removable chip / a proper close icon, prefer it over the raw `<button>`+`ArrowUp`; the executor should check the DS exports and swap in the idiomatic component + a close/x icon from `@/ui/pixel-icons`.)

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm --filter @meld/web exec vitest run src/features/design/components/screen-composer.test.tsx`
Expected: PASS.
Run: `pnpm --filter @meld/web exec tsc --noEmit`
Expected: PASS (consumer `user-flow-trial-canvas.tsx` passes `sketchSelection` which is now an array — confirm its type flows; the hook from Task 4 already returns an array).

- [ ] **Step 5: Lint + commit**

Run: `pnpm --filter @meld/web exec eslint src/features/design/components/screen-composer.tsx && pnpm check:astryx`
```bash
git add apps/web/src/features/design/components/screen-composer.tsx apps/web/src/features/design/components/screen-composer.test.tsx
git commit -m "feat(canvas): removable screen chips + fan-out generation in composer

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: E2E — page-name relabel + multi-select fan-out (fakes + specs)

**Files:**
- Modify: `apps/web/src/features/rooms/e2e-fake.ts` (fake emits a `name`; materialize sets the screen name; support multi-target queueing)
- Modify: `e2e/design-sketch-generate.spec.ts` (assert relabel + two chips + two tasks)
- Test: the e2e spec IS the test.

**Interfaces:**
- Consumes: Tasks 1-6.

- [ ] **Step 1: Extend the fake to name screens on generation**

In `apps/web/src/features/rooms/e2e-fake.ts`, in the fake generation's materialization tick (where `pendingDesignScreenGenerations` becomes a built version — locate the function that flips `done`/creates the version, near the `pendingDesignScreenGenerations` push at line ~1652 and its consumer), set the screen's `name` to a deterministic value derived from the instruction when the current name is `"Screen"`, e.g. `"Vehicle Pool"` for the sketch fixture, mirroring the real placeholder guard: only overwrite when `screen.name === "Screen"`. Keep the existing markup-renders-instruction behavior intact (the current spec asserts on it).

- [ ] **Step 2: Update the e2e spec to assert the relabel**

In `e2e/design-sketch-generate.spec.ts`, after the preview materializes (after line ~148), assert the frame's `props.name` updated via the trial editor handle:
```ts
await expect.poll(() => page.evaluate((screenId) => {
  const editor = (window as unknown as { __MELD_TLDRAW_TRIAL_EDITOR__?: TrialEditor }).__MELD_TLDRAW_TRIAL_EDITOR__;
  const frame = editor?.getCurrentPageShapes().find((s) => s.type === "frame" && s.meta.meldScreenId === screenId) as { props?: { name?: string } } | undefined;
  return frame?.props?.name ?? null;
}, SCREEN_ID)).not.toBe("Screen");
```
(Extend `TrialEditor`/`TrialShape` local types with `props?: { name?: string }` as needed.)

- [ ] **Step 3: Add a multi-select fan-out e2e case**

Add a second test (or extend a fixture room with two unbuilt screens) that: draws inside two frames, selects both frames, asserts two `Editing: …` chips are visible in `screen-composer`, fills an instruction, clicks Generate, and asserts two "building"/queued turns appear (two optimistic turns → two tasks). Use the same `__MELD_TLDRAW_TRIAL_EDITOR__.select(frameA, frameB)` handle. If the sketch fixture room only has one screen, add a two-screen fixture room in `e2e-fake.ts` mirroring the existing `E2E_DESIGN_SKETCH_ROOM_ID` setup and reference it from the spec.

- [ ] **Step 4: Run the canvas-trial e2e**

Run: `pnpm exec playwright test --config playwright.canvas-trial.config.ts design-sketch-generate.spec.ts`
Expected: PASS. (Requires local Supabase reachable as `authenticated`; if the harness's DB-auth blocks it locally — the known env gap — capture the failure and note it, but the fake-backed assertions on chips/relabel should run against the web server without the real RPC.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/rooms/e2e-fake.ts e2e/design-sketch-generate.spec.ts
git commit -m "test(e2e): assert frame relabel + multi-screen fan-out on the canvas

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Typecheck + lint the whole workspace**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 2: Unit + SQL suites**

Run: `pnpm --filter @meld/prototype exec vitest run && pnpm --filter @meld/web exec vitest run && pnpm --filter @meld/connector exec vitest run`
Run: `supabase test db`
Run: `pnpm test:sql`
Expected: PASS.

- [ ] **Step 3: Colocation + astryx conventions**

Run: `pnpm test:astryx && pnpm test:colocation`
Expected: PASS.

- [ ] **Step 4: Final commit if anything was fixed up**

Only if verification surfaced fixes:
```bash
git add -A && git commit -m "chore(canvas): verification fixups for screen naming + multi-select

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage:**
- F1 page names: Tasks 1 (payload), 2 (connector schema/prompt), 3 (SQL persist + guard). ✅
- F1 placeholder guard (never clobber): Task 3 Step 3(b) `and btrim(name) = 'Screen'`. ✅
- F2 multi-screen selection incl. loose sketch resolution: Task 4. ✅
- F2 removable attachment chips, label + sketch suffix: Task 6 Step 3(f). ✅
- F2 co-selected sketch treated as one: falls out of Task 4's per-frame containment (one entry per screen). ✅
- F2 fan-out one task per screen with its own sketch: Task 5 (`startMany`) + Task 6 Step 3(e). ✅
- Partial failure isolation: Task 5 poll/deliver removes tasks independently; `startMany` uses `Promise.all` over independent `enqueue`s. ✅
- Testing (unit/SQL/e2e): Tasks 1-7 each ship tests; Task 8 runs the suites. ✅

**Placeholder scan:** No "TBD/TODO". Two intentional "executor should check the DS exports"/"locate the function" directives (Task 6 chip component, Task 7 fake tick) are pointed at specific files with concrete fallback code given — acceptable, not vague. `SCREEN_ID`/`TrialEditor` reference existing spec symbols.

**Type consistency:** `CanvasScreenSelection` (Task 4) is consumed with the same field names in Tasks 5-7 (`targetScreenId`, `frame`, `sketchShapes`). `startMany(inputs: StartInput[])` (Task 5) matches the call in Task 6. `aggregateStatus` signature matches its test. `generation.isGenerating`/`startMany` produced in Task 5 are consumed in Task 6. ✅
