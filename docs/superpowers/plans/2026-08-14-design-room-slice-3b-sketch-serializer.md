# Design Room Slice 3b — Sketch → Layout Serializer & Selection-Aware Composer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a designer draw the layout of a screen inside its canvas frame and have that sketch shape the generation — "sketch says where, chat says what" — purely additively (empty sketch = today's chat-only path, unchanged).

**Architecture:** A pure `serializeSketch(shapes, frame)` turns the non-meld shapes contained in a screen frame into ordered, coarsely-positioned, labeled boxes (no roles, no nesting). A pure `formatSketchLayoutForPrompt` renders that to a compact text block. The web `generateDesignScreen` action folds the block into the instruction it already sends (no SQL/contract/hydration change — the layout reaches the prompt through the existing instruction channel). A thin canvas-selection bridge feeds the composer the selected frame + its contained sketch shapes.

**Tech Stack:** TypeScript 5.9.3, Zod 4.4.3, tldraw 5.3.0, `@astryxdesign/core`, vitest, Playwright, Node 22.23.2.

**Design spec:** `docs/superpowers/specs/2026-08-14-design-room-sketch-serializer-design.md`
**Builds on:** slice-2a `buildDesignScreenSystemPrompt`; slice-2c `generateDesignScreen` + `ScreenComposer`; slice-3a canvas frames (`screenFrameId`, the `frame`+`meta.meldScreenId` projection, the canvas editor ref/`waitForEditor`).

> **Deliberate deviation from the spec (approved at handoff):** the spec described a separate `AIContextPackageSchema.designContext.layout` field. Because the layout originates client-side and would otherwise need a SQL migration to reach the hydrated context, this plan instead threads it through the **existing instruction** via `formatSketchLayoutForPrompt`. Same model behavior, no DB/contract/connector change. If a structured field is wanted later, promoting it is additive.

## Global Constraints

- Node `>=22.23.2`, pnpm `10.28.1`, TS `5.9.3`, Zod `4.4.3`, tldraw pinned `5.3.0`. Never change versions.
- **Sketch says where; chat says what.** The serializer reports `shapeKind` + `text` + coarse `position` + coarse `size` only — never a role ("button"/"card") and never nesting. Meaning is the instruction's job.
- A sketch attaches to a screen by **containment**: non-meld-meta shapes whose center falls inside a screen frame's bounds are that frame's layout. (Meld shapes = flow shapes or screen frames, identifiable by `meta.meldScreenId` / flow meta; everything else is sketch.)
- Position/size are **coarse quantized buckets** (exact thresholds below), deterministic, frame-relative. Same shapes + frame → identical output.
- Layout is **optional and additive**: no sketch / nothing selected / view access → no layout → the instruction sent is byte-identical to slice 2c.
- Pure engines (`serializeSketch`, `formatSketchLayoutForPrompt`, the containment predicate) live in `@meld/prototype` and depend only on Zod. No editor, no I/O.
- `apps/web/src` obeys `check:astryx` (no raw `<div>`/`<span>`, no hex/rgb, no bare px, no Tailwind) — `@astryxdesign/core` + `var(--color-…)`. Editor code is client-only.
- Exact bucket thresholds (pin these; unit-tested): **position** by frame thirds — vertical `top` if shape-center-y fraction `< 1/3`, `middle` if `< 2/3`, else `bottom`; horizontal `left`/`center`/`right` the same by center-x fraction. **width** by fraction of frame width: `< 0.33` narrow, `< 0.66` medium, `< 0.95` wide, else full. **height** by fraction of frame height: `< 0.2` short, `< 0.5` medium, else tall. **Box cap** = 60 (excess dropped in reading order, `truncated: true` set).

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/prototype/src/sketch-layout.ts` | `SketchShape`/`SketchLayout` types, `SketchLayoutSchema`, `serializeSketch`, `shapeCenterInFrame` (containment predicate), and `MAX_SKETCH_BOXES`. |
| `packages/prototype/src/sketch-layout.test.ts` | Exhaustive serializer + containment tests. |
| `packages/prototype/src/sketch-layout-prompt.ts` | `formatSketchLayoutForPrompt(layout)` pure text renderer. |
| `packages/prototype/src/sketch-layout-prompt.test.ts` | Formatter tests. |
| `packages/prototype/src/index.ts` | Re-export both modules. |
| `apps/web/src/features/design/design-screen-generation.ts` | `generateDesignScreen` gains optional `layout`; folds the formatted block into the instruction. |
| `apps/web/src/features/design/design-screen-generation.test.ts` | Layout-threading action tests. |
| `apps/web/src/features/canvas/use-canvas-selection.ts` | Bridge hook: editor selection → `{ targetScreenId, sketchShapes, frame } | null`. |
| `apps/web/src/features/canvas/use-canvas-selection.test.ts` | Bridge unit test (faked editor). |
| `apps/web/src/features/design/components/screen-composer.tsx` | Consume the bridge: target the selected frame, pass `layout`, show the "sketch: N shapes" affordance. |
| `apps/web/src/features/design/components/screen-composer.test.tsx` | Composer sketch-aware tests. |
| `apps/web/src/features/canvas/user-flow-trial-canvas.tsx` (+ tab passthrough) | Expose the editor selection to the composer (or mount the bridge where the composer lives). |
| `e2e/design-sketch-generate.spec.ts` | Draw shapes in a frame → generate → layout reaches (fake) generation + affordance shows. |

---

### Task 1: The serializer + containment predicate

**Files:** Create `packages/prototype/src/sketch-layout.ts` + test; modify `packages/prototype/src/index.ts`.

**Interfaces:**
- Produces: `type SketchShape = { kind: "rectangle"|"ellipse"|"line"|"text"|"other"; x: number; y: number; w: number; h: number; text: string | null }`; `type SketchLayout` (per spec); `SketchLayoutSchema` (Zod, `.strict()`); `serializeSketch(shapes: SketchShape[], frame: { x: number; y: number; w: number; h: number }): SketchLayout`; `shapeCenterInFrame(shape: { x: number; y: number; w: number; h: number }, frame: { x: number; y: number; w: number; h: number }): boolean`; `MAX_SKETCH_BOXES = 60`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { serializeSketch, shapeCenterInFrame, SketchLayoutSchema, MAX_SKETCH_BOXES } from "./sketch-layout";

const frame = { x: 0, y: 0, w: 300, h: 900 }; // 3-wide buckets at 100; thirds at 300/600

function box(kind: any, x: number, y: number, w: number, h: number, text: string | null = null) {
  return { kind, x, y, w, h, text };
}

describe("serializeSketch", () => {
  it("buckets position by frame thirds", () => {
    const out = serializeSketch([box("rectangle", 0, 0, 30, 30, "a")], frame).boxes[0];
    expect(out.position).toEqual({ vertical: "top", horizontal: "left" });
    const mid = serializeSketch([box("rectangle", 135, 405, 30, 30)], frame).boxes[0]; // center 150,420 → x .5, y .47
    expect(mid.position).toEqual({ vertical: "middle", horizontal: "center" });
    const br = serializeSketch([box("rectangle", 270, 870, 30, 30)], frame).boxes[0]; // center .95,.97
    expect(br.position).toEqual({ vertical: "bottom", horizontal: "right" });
  });

  it("buckets size by fraction of frame", () => {
    expect(serializeSketch([box("rectangle", 0, 0, 30, 30)], frame).boxes[0].size)
      .toEqual({ width: "narrow", height: "short" });      // 0.1 w, 0.033 h
    expect(serializeSketch([box("rectangle", 0, 0, 300, 900)], frame).boxes[0].size)
      .toEqual({ width: "full", height: "tall" });
    expect(serializeSketch([box("rectangle", 0, 0, 150, 270)], frame).boxes[0].size)
      .toEqual({ width: "medium", height: "medium" });     // 0.5 w, 0.3 h
  });

  it("orders top-to-bottom then left-to-right, and reports text verbatim (trimmed)", () => {
    const out = serializeSketch([
      box("rectangle", 200, 500, 20, 20, "  second-row-right "),
      box("text", 0, 0, 20, 20, " first "),
      box("rectangle", 0, 500, 20, 20, "second-row-left"),
    ], frame);
    expect(out.boxes.map((b) => b.text)).toEqual(["first", "second-row-left", "second-row-right"]);
  });

  it("maps unknown kinds to 'other' and never throws on zero-size", () => {
    const out = serializeSketch([box("weird", 10, 10, 0, 0, null)], frame);
    expect(out.boxes[0].shapeKind).toBe("other");
  });

  it("caps boxes and flags truncation", () => {
    const many = Array.from({ length: MAX_SKETCH_BOXES + 5 }, (_, i) => box("rectangle", 0, i, 10, 10));
    const out = serializeSketch(many, frame);
    expect(out.boxes).toHaveLength(MAX_SKETCH_BOXES);
    expect(out.truncated).toBe(true);
  });

  it("is deterministic and schema-valid", () => {
    const shapes = [box("rectangle", 10, 10, 30, 40, "x")];
    expect(serializeSketch(shapes, frame)).toEqual(serializeSketch(shapes, frame));
    expect(() => SketchLayoutSchema.parse(serializeSketch(shapes, frame))).not.toThrow();
  });
});

describe("shapeCenterInFrame", () => {
  it("is true when the shape center is inside the frame", () => {
    expect(shapeCenterInFrame({ x: 10, y: 10, w: 20, h: 20 }, frame)).toBe(true);
    expect(shapeCenterInFrame({ x: 400, y: 10, w: 20, h: 20 }, frame)).toBe(false);
  });
});
```

- [ ] **Step 2: Run → fail** — `pnpm --filter @meld/prototype test sketch-layout` → module not found.

- [ ] **Step 3: Implement**

Create `packages/prototype/src/sketch-layout.ts`:

```ts
import { z } from "zod";

export const MAX_SKETCH_BOXES = 60;
const MAX_TEXT = 200;

const ShapeKind = z.enum(["rectangle", "ellipse", "line", "text", "other"]);

export type SketchShape = {
  kind: z.infer<typeof ShapeKind> | string;
  x: number; y: number; w: number; h: number;
  text: string | null;
};

export const SketchLayoutSchema = z
  .object({
    boxes: z
      .array(
        z.object({
          shapeKind: ShapeKind,
          text: z.string().nullable(),
          position: z.object({
            vertical: z.enum(["top", "middle", "bottom"]),
            horizontal: z.enum(["left", "center", "right"]),
          }).strict(),
          size: z.object({
            width: z.enum(["narrow", "medium", "wide", "full"]),
            height: z.enum(["short", "medium", "tall"]),
          }).strict(),
        }).strict(),
      )
      .max(MAX_SKETCH_BOXES),
    truncated: z.boolean(),
  })
  .strict();
export type SketchLayout = z.infer<typeof SketchLayoutSchema>;

function third(fraction: number): 0 | 1 | 2 {
  return fraction < 1 / 3 ? 0 : fraction < 2 / 3 ? 1 : 2;
}
function widthBucket(f: number) {
  return f < 0.33 ? "narrow" : f < 0.66 ? "medium" : f < 0.95 ? "wide" : "full";
}
function heightBucket(f: number) {
  return f < 0.2 ? "short" : f < 0.5 ? "medium" : "tall";
}
function normalizeKind(kind: string): z.infer<typeof ShapeKind> {
  return (["rectangle", "ellipse", "line", "text"] as const).includes(kind as never)
    ? (kind as z.infer<typeof ShapeKind>)
    : "other";
}

export function shapeCenterInFrame(
  shape: { x: number; y: number; w: number; h: number },
  frame: { x: number; y: number; w: number; h: number },
): boolean {
  const cx = shape.x + shape.w / 2;
  const cy = shape.y + shape.h / 2;
  return cx >= frame.x && cx <= frame.x + frame.w && cy >= frame.y && cy <= frame.y + frame.h;
}

export function serializeSketch(
  shapes: SketchShape[],
  frame: { x: number; y: number; w: number; h: number },
): SketchLayout {
  const fw = frame.w || 1;
  const fh = frame.h || 1;
  const ordered = [...shapes].sort((a, b) => (a.y - b.y) || (a.x - b.x));
  const truncated = ordered.length > MAX_SKETCH_BOXES;
  const V = ["top", "middle", "bottom"] as const;
  const H = ["left", "center", "right"] as const;
  const boxes = ordered.slice(0, MAX_SKETCH_BOXES).map((s) => {
    const cxf = (s.x + s.w / 2 - frame.x) / fw;
    const cyf = (s.y + s.h / 2 - frame.y) / fh;
    return {
      shapeKind: normalizeKind(String(s.kind)),
      text: s.text === null ? null : s.text.trim().slice(0, MAX_TEXT) || null,
      position: { vertical: V[third(cyf)], horizontal: H[third(cxf)] },
      size: { width: widthBucket(s.w / fw), height: heightBucket(s.h / fh) },
    };
  });
  return { boxes, truncated };
}
```

Append to `packages/prototype/src/index.ts`: `export * from "./sketch-layout";`

- [ ] **Step 4: Run** — `pnpm --filter @meld/prototype test sketch-layout && pnpm --filter @meld/prototype typecheck && pnpm --filter @meld/prototype lint` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/prototype/src/sketch-layout.ts packages/prototype/src/sketch-layout.test.ts packages/prototype/src/index.ts
git commit -m "feat(prototype): pure sketch->layout serializer + containment predicate"
```

---

### Task 2: The prompt formatter

**Files:** Create `packages/prototype/src/sketch-layout-prompt.ts` + test; modify `index.ts`.

**Interfaces:**
- Produces: `formatSketchLayoutForPrompt(layout: SketchLayout): string` — a compact human-readable block listing each box in order (`- <size> <shapeKind> at <vertical>-<horizontal>[: "<text>"]`), prefixed with a header line explaining it is placement guidance; returns `""` when `layout.boxes` is empty.

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from "vitest";
import { formatSketchLayoutForPrompt } from "./sketch-layout-prompt";
import type { SketchLayout } from "./sketch-layout";

const layout: SketchLayout = {
  boxes: [
    { shapeKind: "rectangle", text: "Start free trial", position: { vertical: "bottom", horizontal: "center" }, size: { width: "wide", height: "short" } },
    { shapeKind: "text", text: "Choose your plan", position: { vertical: "top", horizontal: "left" }, size: { width: "medium", height: "short" } },
  ],
  truncated: false,
};

describe("formatSketchLayoutForPrompt", () => {
  it("lists boxes in order with placement + text", () => {
    const s = formatSketchLayoutForPrompt(layout);
    expect(s).toMatch(/sketch/i);
    expect(s).toContain('wide rectangle at bottom-center: "Start free trial"');
    expect(s).toContain('medium text at top-left: "Choose your plan"');
  });
  it("returns empty string for an empty sketch", () => {
    expect(formatSketchLayoutForPrompt({ boxes: [], truncated: false })).toBe("");
  });
  it("notes truncation when set", () => {
    expect(formatSketchLayoutForPrompt({ boxes: layout.boxes, truncated: true })).toMatch(/additional/i);
  });
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement**

```ts
import type { SketchLayout } from "./sketch-layout";

export function formatSketchLayoutForPrompt(layout: SketchLayout): string {
  if (layout.boxes.length === 0) return "";
  const lines = layout.boxes.map((b) => {
    const where = `${b.position.vertical}-${b.position.horizontal}`;
    const what = `${b.size.width} ${b.shapeKind}`;
    return b.text ? `- ${what} at ${where}: "${b.text}"` : `- ${what} at ${where}`;
  });
  const note = layout.truncated ? "\n(additional shapes were omitted)" : "";
  return `The user sketched this rough layout — use it for WHERE things go; the instruction says WHAT each region is:\n${lines.join("\n")}${note}`;
}
```

Append the export to `index.ts`.

- [ ] **Step 4: Run** — `pnpm --filter @meld/prototype test && typecheck && lint` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/prototype/src/sketch-layout-prompt.ts packages/prototype/src/sketch-layout-prompt.test.ts packages/prototype/src/index.ts
git commit -m "feat(prototype): format a sketch layout as prompt placement guidance"
```

---

### Task 3: Thread the layout through the generate action

**Files:** Modify `apps/web/src/features/design/design-screen-generation.ts` + test.

**Interfaces:**
- Consumes: `serializeSketch` output type `SketchLayout`, `formatSketchLayoutForPrompt` (from `@meld/prototype`).
- Produces: `generateDesignScreen` input gains optional `layout?: SketchLayout`. When present and non-empty, the `target_instruction` sent to `create_design_screen_generate_task` becomes `\`${instruction}\n\n${formatSketchLayoutForPrompt(layout)}\``. When absent/empty, the instruction is unchanged (byte-identical to slice 2c). The fake path (`fakeGenerateDesignScreen`) receives the same combined instruction.

- [ ] **Step 1: Failing test**

Add to `design-screen-generation.test.ts`: with a `layout` of one labeled box, the mocked `create_design_screen_generate_task` (and the fake) is called with `target_instruction` containing both the user text and the formatted box line; with no `layout`, `target_instruction` equals the raw instruction (assert exact equality).

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement**

Extend `GenerateInput` with `layout: SketchLayoutSchema.optional()` (import from `@meld/prototype`). Where the action currently builds the RPC args, compute:
```ts
const layoutBlock = parsed.data.layout ? formatSketchLayoutForPrompt(parsed.data.layout) : "";
const instruction = layoutBlock ? `${parsed.data.instruction}\n\n${layoutBlock}` : parsed.data.instruction;
```
and pass `target_instruction: instruction` (real RPC path) / the same `instruction` into `fakeGenerateDesignScreen`. Keep everything else identical. (`isRoomFakeEnabled()` branch unchanged except it receives the combined instruction.)

- [ ] **Step 4: Run** — `cd apps/web && npx vitest run design-screen-generation && cd .. && pnpm --filter web typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/design/design-screen-generation.ts apps/web/src/features/design/design-screen-generation.test.ts
git commit -m "feat(web): fold a serialized sketch layout into screen generation"
```

---

### Task 4: The canvas-selection bridge hook

**Files:** Create `apps/web/src/features/canvas/use-canvas-selection.ts` + test.

**Interfaces:**
- Produces: `canvasSketchSelection(editor: SelectionEditor): { targetScreenId: string; sketchShapes: SketchShape[]; frame: { x:number;y:number;w:number;h:number } } | null` — a **pure** function taking a minimal editor-shaped interface, plus a thin `useCanvasSketchSelection(editorRef)` hook wrapping it reactively. `SelectionEditor` = `{ getSelectedShapes(): EditorShape[]; getCurrentPageShapes(): EditorShape[]; getShapePageBounds(id): Bounds | null }` where `EditorShape = { id: string; type: string; meta: Record<string, unknown>; }`. Returns null when no single screen frame is selected.

Design: keep the *logic* pure (`canvasSketchSelection`) so it unit-tests without a real editor; the hook is a thin reactive wrapper (`track`/`useValue`) that calls it.

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from "vitest";
import { canvasSketchSelection } from "./use-canvas-selection";

const frameBounds = { x: 0, y: 0, w: 300, h: 900 };
function editor(selected: any[], page: any[], bounds: Record<string, any>) {
  return { getSelectedShapes: () => selected, getCurrentPageShapes: () => page,
    getShapePageBounds: (id: string) => bounds[id] ?? null };
}
const frameShape = { id: "shape:screen-s1", type: "frame", meta: { meldScreenId: "s1" } };
const sketch = { id: "shape:geo1", type: "geo", meta: {} };
const flow = { id: "shape:flow1", type: "geo", meta: { meld: { flowNodeId: "n1" } } };

describe("canvasSketchSelection", () => {
  it("returns the selected frame + its contained non-meld shapes", () => {
    const r = canvasSketchSelection(editor([frameShape], [frameShape, sketch, flow], {
      "shape:screen-s1": frameBounds, "shape:geo1": { x: 20, y: 20, w: 40, h: 40 }, "shape:flow1": { x: 10, y: 10, w: 20, h: 20 },
    }))!;
    expect(r.targetScreenId).toBe("s1");
    expect(r.sketchShapes.map((s) => s.kind)).toEqual(["rectangle"]); // geo→rectangle; flow excluded by meta
    expect(r.frame).toEqual(frameBounds);
  });
  it("returns null when no screen frame is selected", () => {
    expect(canvasSketchSelection(editor([sketch], [sketch], { "shape:geo1": { x: 0, y: 0, w: 10, h: 10 } }))).toBeNull();
  });
  it("excludes shapes whose center is outside the frame", () => {
    const r = canvasSketchSelection(editor([frameShape], [frameShape, sketch], {
      "shape:screen-s1": frameBounds, "shape:geo1": { x: 400, y: 20, w: 10, h: 10 },
    }))!;
    expect(r.sketchShapes).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run → fail** (from `apps/web`).

- [ ] **Step 3: Implement**

`canvasSketchSelection(editor)`: read `getSelectedShapes()`; if not exactly one shape with `meta.meldScreenId` (a screen frame), return null. Get the frame bounds via `getShapePageBounds(frame.id)`. Enumerate `getCurrentPageShapes()`, keep shapes that (a) are not the frame, (b) have no `meta.meldScreenId` and no `meta.meld` flow marker (sketch only), (c) whose bounds' center is inside the frame (`shapeCenterInFrame` from `@meld/prototype`). Map each kept shape to a `SketchShape` — `kind` from a small `tldrawTypeToSketchKind(type, meta)` map (`geo`→`rectangle` unless the geo is an ellipse in `meta`/props; `text`→`text`; `draw`/`line`→`line`; else `other`), bounds from `getShapePageBounds`, `text` from the shape's rich text if present (a `shapeText(shape)` helper reading `props.richText`/`props.text` — reuse whatever `user-flow-to-document.ts` uses to read shape text). Return `{ targetScreenId: meta.meldScreenId, sketchShapes, frame }`.

`useCanvasSketchSelection(editorRef)`: a hook that, using tldraw's `useValue`/`track` against `editorRef.current`, recomputes `canvasSketchSelection(editor)` reactively and returns it (or null). Keep it a thin wrapper — all logic is in the pure function.

- [ ] **Step 4: Run** — `cd apps/web && npx vitest run use-canvas-selection && cd .. && pnpm --filter web typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/canvas/use-canvas-selection.ts apps/web/src/features/canvas/use-canvas-selection.test.ts
git commit -m "feat(canvas): pure selection bridge for the selected frame's contained sketch"
```

---

### Task 5: Make the composer sketch-aware

**Files:** Modify `apps/web/src/features/design/components/screen-composer.tsx` + test; wire the editor selection where the composer is rendered (`user-flow-trial-canvas.tsx` or the composer's mount, following slice 3a's canvas/composer placement).

**Interfaces:**
- Consumes: `useCanvasSketchSelection` (Task 4), `serializeSketch` (Task 1), `generateDesignScreen`'s new `layout` param (Task 3).
- Produces: when the canvas selection yields a screen frame with contained sketch shapes, Generate/Regenerate targets that `targetScreenId` and passes `layout: serializeSketch(sketchShapes, frame)`; a "▦ sketch: N shapes" indicator renders. No selection / no sketch → the existing text-only path, unchanged.

- [ ] **Step 1: Failing test**

Add to `screen-composer.test.tsx`: given a mocked selection of a frame containing 2 sketch shapes, the composer shows "sketch: 2 shapes" and clicking Generate calls `generateDesignScreen` with `screenId` = the selected id and a `layout` whose `boxes` length is 2; given no selection, Generate is called with no `layout` and the indicator is absent.

- [ ] **Step 2: Run → fail** (from `apps/web`).

- [ ] **Step 3: Implement**

Accept a `selection` prop (the `useCanvasSketchSelection` result) — passing it in keeps the composer testable without a live editor (the canvas parent supplies it). When `selection` is non-null: derive `layout = serializeSketch(selection.sketchShapes, selection.frame)`; the Generate/Regenerate handlers use `selection.targetScreenId` as `screenId` and include `layout` in the `generateDesignScreen` call; render an astryx `Text`/`Badge` "▦ sketch: {selection.sketchShapes.length} shapes" when `sketchShapes.length > 0`. When `selection` is null, behavior is exactly slice 2c. Wire the canvas parent to compute `useCanvasSketchSelection(editorRef)` and pass it to `ScreenComposer`.

- [ ] **Step 4: Run** — `cd apps/web && npx vitest run screen-composer && cd .. && pnpm --filter web typecheck && pnpm check:astryx && pnpm --filter web lint` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/design/components/screen-composer.tsx apps/web/src/features/design/components/screen-composer.test.tsx apps/web/src/features/canvas/user-flow-trial-canvas.tsx
git commit -m "feat(web): sketch-aware composer targeting the selected frame"
```

---

### Task 6: End-to-end — draw, generate, layout lands

**Files:** Create `e2e/design-sketch-generate.spec.ts` (register in `playwright.canvas-trial.config.ts`'s `testMatch`, like `design-canvas.spec.ts`).

**Interfaces:** proves the sketch → generation path in a real browser against the canvas gateway.

- [ ] **Step 1: Write the spec**

Following `e2e/design-canvas.spec.ts` (canvas-trial harness) and the in-memory fake path: seed a room in the `design` stage with one screen frame. On the Canvas, draw (or programmatically insert via the trial editor handle `window.__MELD_TLDRAW_TRIAL_EDITOR__`, used elsewhere in the canvas tests) two `geo` shapes inside the frame's bounds, select the frame, and Generate. Assert the "sketch: 2 shapes" affordance appears, and that the fake generation received an instruction containing the serialized layout (surface it via the fake so the test can read what instruction was sent — extend `fakeGenerateDesignScreen` to record the last instruction, and assert it contains the box lines). Gate on content, not pixels.

- [ ] **Step 2: Run** (free port; kill stale owners; background + poll): `pnpm exec playwright test --config playwright.canvas-trial.config.ts design-sketch-generate.spec.ts --reporter=line`. Expected: PASS. If wiring the editor-insert + selection through the real canvas proves flaky, assert the pure path (selection bridge + serialize + action) via the composer with a seeded selection instead, and note the harness limitation — do not fabricate a pass.

- [ ] **Step 3: Commit**

```bash
git add e2e/design-sketch-generate.spec.ts playwright.canvas-trial.config.ts
git commit -m "test(e2e): sketching inside a frame feeds the screen generation"
```

---

## Definition of done

- `pnpm --filter @meld/prototype test`/`typecheck`/`lint` pass (serializer, containment, formatter — exhaustive pure tests).
- From `apps/web`: `npx vitest run` passes (action threading, selection bridge, sketch-aware composer); `pnpm --filter web typecheck`, `check:astryx`, `lint` clean.
- With a sketch inside a selected frame, Generate sends an instruction containing the formatted layout and targets that screen; with no sketch/selection, the instruction is byte-identical to slice 2c.
- `e2e/design-sketch-generate.spec.ts` proves the path against the canvas gateway.
- No SQL, no `AIContextPackage` change, no connector change (the layout rides the existing instruction) — per the approved deviation.

**Deferred:** nested/region layouts and role inference (spec decisions #1/#2 — not now); a structured `designContext.layout` field (promote later if wanted); the unified history drawer + Define-flow seeding (slice 3c); the promoted-vs-versionId concurrency gate (revisit as canvas concurrency grows).
