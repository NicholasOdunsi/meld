# Canvas Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an isolated, tldraw-free canvas prototype for drawing, arranging objects, and displaying existing HTML screens.

**Architecture:** A versioned document and reversible commands own canvas content. React renders SVG geometry and positioned sandboxed HTML previews through a shared camera transform. A separate development route exercises the prototype without touching production boards, the tldraw gateway, or database schemas.

**Tech Stack:** Existing Next.js, React, TypeScript, Zod, Astryx, SVG, Vitest, Playwright.

## Global Constraints

- “Keep the native Swift app interface and build a purpose-built web canvas without a tldraw runtime dependency.”
- “Preserve the isolation guarantees of existing previews.”
- “Use Astryx components and design tokens for application controls.”
- “Do not rely on an expired tldraw license for the rollout or fallback.”
- No production route changes, schema writes, or deletion of legacy data in this stage.
- No subagent dispatch without user authorization; execute inline by default.

## Delivery boundaries

The approved design spans four sequential stages:

1. **This plan: canvas foundation.** Testable development prototype with local JSON import/export and HTML previews.
2. **HTML editing and AI flow.** A separate plan defines stable element IDs, isolated message transport, durable source patches, generation revision handling, and selection-to-AI adapters.
3. **Persistence and migration.** A separate plan follows an inventory of actual stored snapshots and a schema/authorization review. It covers single-writer enforcement, revision checks, recovery copies, source history, and migration reports.
4. **Integration and rollout.** A separate plan connects native project navigation, replaces production canvas entry points, validates Mac interaction, and removes all production tldraw dependencies after an import audit.

This prototype is not the complete replacement and must not be presented as production-ready. Those later stages remain required for the full design's acceptance criteria.

## File map

All new canvas modules belong in `apps/web/src/features/canvas-next/`:

- `document.ts`: versioned discriminated object schema and bounded JSON decoding.
- `camera.ts`: coordinate conversions and pointer-anchored zoom.
- `commands.ts`: reversible document history; view state remains separate.
- `interaction.ts`: pointer gesture state and object hit tests.
- `canvas-scene.tsx`: SVG drawing and HTML frame positioning.
- `canvas-toolbar.tsx`: Astryx tool controls and status.
- `canvas-prototype.tsx`: state composition, file import/export, and fixture wiring.
- `fixtures.ts`: deterministic demonstration content, including a safe HTML screen.
- Colocated `.test.ts` / `.test.tsx` files verify behavior.

Create `apps/web/src/app/dev/canvas-next/page.tsx` as a development-only entry. Existing `screen-preview-doc.ts` is reused rather than copied. Add `e2e/canvas-next.spec.ts` for the prototype flow.

## Task 1: Document format and safe file round-trip

**Files:** Create `document.ts`, `document.test.ts` in the new feature directory.

**Interfaces:** Export `Point`, `CanvasObject`, `CanvasDocument`, `CanvasDocumentSchema`, and `decodeCanvasDocument(raw: string): CanvasDocument`.

- [ ] Write a failing schema test using this representative document:

```ts
const sample = {
  version: 1,
  objects: [{ id: "note-1", kind: "text", x: 10, y: 20,
    width: 200, height: 80, text: "Landing page" }],
};
expect(decodeCanvasDocument(JSON.stringify(sample))).toEqual(sample);
expect(() => decodeCanvasDocument('{"version":2,"objects":[]}')).toThrow();
expect(() => decodeCanvasDocument(JSON.stringify({ ...sample,
  objects: [sample.objects[0], sample.objects[0]] }))).toThrow();
```

- [ ] Run `pnpm --filter @meld/web exec vitest run src/features/canvas-next/document.test.ts`; expect failure because the module does not exist.
- [ ] Implement strict Zod unions with common finite `x`, `y`, positive finite `width`, `height`, nonempty bounded `id`. Object kinds are `stroke` (`points: Point[]`), `rectangle`, `text` (`text: string`), `image` (`assetId: string`), and `html-frame` (`screenId: string`). Array order is stacking order. Require unique IDs. Limit JSON input to 8 MiB, objects to 5,000, points per stroke to 10,000, and text to 32,000 characters. Reject extra keys, unsupported versions, nonfinite coordinates, empty strokes, and invalid dimensions. Export the inferred types:

```ts
export type Point = { x: number; y: number };
export type CanvasDocument = z.infer<typeof CanvasDocumentSchema>;
export type CanvasObject = CanvasDocument["objects"][number];
```

- [ ] Add boundary cases for every rejection above; rerun the focused test and expect all cases to pass.
- [ ] Commit only these files with `feat(canvas): define independent canvas document`.

## Task 2: Camera and reversible content commands

**Files:** Create `camera.ts`, `camera.test.ts`, `commands.ts`, `commands.test.ts`.

**Interfaces:** Export `Camera = { x: number; y: number; zoom: number }`, `toScreen(point: Point, camera: Camera): Point`, `toWorld(point: Point, camera: Camera): Point`, `zoomAt(camera: Camera, anchor: Point, zoom: number): Camera`. Commands export `History`, `createHistory(doc: CanvasDocument): History`, `replaceDocument(history: History, doc: CanvasDocument): History`, `undo(history: History): History`, `redo(history: History): History`. History has `past`, `present`, and `future` document fields.

- [ ] Write failing tests for the following invariants:

```ts
const camera = { x: 40, y: -20, zoom: 2 };
const point = { x: 100, y: 50 };
expect(toWorld(toScreen(point, camera), camera)).toEqual(point);
const anchor = { x: 200, y: 120 };
expect(toWorld(anchor, zoomAt(camera, anchor, 4)))
  .toEqual(toWorld(anchor, camera));
const first = createHistory({ version: 1, objects: [] });
const changed = replaceDocument(first, sample);
expect(undo(changed).present).toEqual(first.present);
expect(redo(undo(changed)).present).toEqual(sample);
```

- [ ] Run focused camera and command tests; expect missing-module failures.
- [ ] Implement the transform convention below, clamp zoom to 0.1–8, and reject nonfinite inputs. Keep a maximum of 100 history entries and clear redo on a new edit. A pointer gesture commits once at its end; camera movement does not enter content history.

```ts
// screen = world * zoom + camera translation
const world = toWorld(anchor, camera);
const next = { zoom, x: anchor.x - world.x * zoom,
  y: anchor.y - world.y * zoom };
```

- [ ] Verify zoom clamping, undo with empty history, redo invalidation, history limits, and no input mutation. Rerun the two focused test files and expect pass.
- [ ] Commit with `feat(canvas): add camera transforms and command history`.

## Task 3: Pointer tools and object manipulation

**Files:** Create `interaction.ts`, `interaction.test.ts`.

**Interfaces:** Export `Tool = "select" | "pan" | "draw" | "rectangle" | "text"`; `hitTest(doc: CanvasDocument, world: Point, tolerance: number): string | null`; `translateObjects(doc: CanvasDocument, ids: string[], delta: Point): CanvasDocument`; `resizeObject(doc: CanvasDocument, id: string, bounds: { x: number; y: number; width: number; height: number }): CanvasDocument`. For strokes, points are local to the object's bounds and scale with resize.

- [ ] Add failing tests for topmost selection, point-to-segment stroke hit tests, translation, rectangle normalization when dragging backwards, and minimum positive resize dimensions. Use actual document fixtures from Task 1:

```ts
const moved = translateObjects(sample, ["note-1"], { x: 5, y: -3 });
expect(moved.objects[0]).toMatchObject({ x: 15, y: 17 });
expect(sample.objects[0]).toMatchObject({ x: 10, y: 20 });
expect(hitTest(sample, { x: 15, y: 25 }, 4)).toBe("note-1");
expect(hitTest(sample, { x: -100, y: -100 }, 4)).toBeNull();
```

- [ ] Run the interaction test file; expect missing exports.
- [ ] Implement immutable geometry operations. Hit test objects back-to-front; convert screen selection tolerance to world units using camera zoom. Ignore unknown selected IDs. Text, images, rectangles, and HTML frames use bounds; strokes use segment distance. Capture the initial document and pointer for each gesture, derive transient changes from that baseline, and restore it on pointer cancellation or Escape. Keyboard Delete removes selection; prevent shortcuts while a text field has focus.
- [ ] Rerun tests, including resize and move at non-unit zoom and cancellation without a history entry; expect pass.
- [ ] Commit with `feat(canvas): implement drawing and object manipulation`.

## Task 4: Render an isolated, usable prototype

**Files:** Create `canvas-scene.tsx`, `canvas-toolbar.tsx`, `canvas-prototype.tsx`, `fixtures.ts`, `canvas-prototype.test.tsx`, and `apps/web/src/app/dev/canvas-next/page.tsx`.

**Interfaces:** `CanvasScene` receives `{ document: CanvasDocument; camera: Camera; selectedIds: string[]; screens: CanvasScreen[] }` plus pointer handlers. `CanvasPrototype` owns history, tool state, selection, camera, and local file handling. Existing `CanvasScreen` is imported as a type from `features/design/canvas-screen-reader`.

- [ ] Before writing UI, run `pnpm exec astryx build "canvas editor with toolbar and inspector"`, `pnpm exec astryx docs layout`, `pnpm exec astryx docs tokens`, and inspect the returned templates and every component used. Budget a full-height shell, compact toolbar, expanding scene, and optional inspector using available token values. No raw div/span layout, new CSS imports, or hardcoded UI styling.
- [ ] Add a failing component test that renders `CanvasPrototype`, switches to rectangle mode, draws one rectangle, undoes it, and restores it with redo. Assert the document object count via accessible scene content or an exported document callback.
- [ ] Implement a single shared camera transform for SVG geometry and HTML frames. Use `buildFramePreviewDoc` for frame documents, keep `sandbox=""`, and leave preview pointer input disabled in this stage. Render images only through an app-owned asset map; reject arbitrary imported image URLs. Fixture images are bundled test assets. The initial scene contains a sketch, note, image, and generated HTML frame.
- [ ] Wire pointer capture, wheel pan, anchored modifier-wheel zoom, Space-drag pan, selection, drag, resize handles, freehand strokes, rectangle creation, inline plain-text editing, Delete, Escape, and undo/redo. An imported file replaces the document only after successful decoding and enters history as one command. Export downloads versioned JSON. Label the prototype “Local prototype — export to keep your work”; it has no server persistence.
- [ ] Gate the route on `process.env.NODE_ENV === "development"`; call Next.js `notFound()` otherwise. Do not import the production trial tab or request a canvas ticket. Use fixture screen data, not authenticated production records.
- [ ] Run the component test and `pnpm --filter @meld/web typecheck`. Then run `pnpm check:astryx`. Fix violations using component props/tokens; do not weaken the checker. Verify no tldraw imports in the new feature or route.
- [ ] Commit with `feat(canvas): add isolated web canvas prototype`.

## Task 5: Browser proof and performance evidence

**Files:** Create `e2e/canvas-next.spec.ts`; add results to this plan after execution.

- [ ] Write a Playwright flow that opens `/dev/canvas-next`, draws a stroke and rectangle, adds text, moves/resizes a frame, zooms around the pointer, and exercises undo/redo. Export JSON, reload the route, import that JSON, and assert equivalent document content. Verify the sandboxed fixture HTML renders while generated scripts remain disabled.

```ts
test("opens without the licensed canvas runtime", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", request => requests.push(request.url()));
  await page.goto("/dev/canvas-next");
  await expect(page.getByText("Local prototype — export to keep your work"))
    .toBeVisible();
  expect(requests.some(url => url.includes("/api/canvas-session"))).toBe(false);
});
```

- [ ] Run `pnpm exec playwright test e2e/canvas-next.spec.ts` with the repository's configured local test services. Inspect Next's dependency/module output as well as network requests: absence of a ticket request alone does not prove absence of tldraw in the route bundle.
- [ ] Inspect the prototype in the Mac host if a local launch is available. Record pointer capture, focus, trackpad gestures, frame placement, and resize alignment. If unavailable, record native-host verification as outstanding rather than claiming it passed.
- [ ] Run a deterministic 1,000-object fixture for 30 seconds of pan and zoom on a recorded machine/browser. Record frame-time p50/p95 and visible-frame count. Target p95 at or below 33 ms; if exceeded, add viewport culling for offscreen shapes/iframes and repeat. This is a prototype threshold, not a promise for all hardware.
- [ ] Run focused new tests, `pnpm --filter @meld/web typecheck`, `pnpm check:astryx`, and `pnpm --filter @meld/web lint`. Run `pnpm build` to verify the production route is unavailable and no unrelated route breaks. Record failures and infrastructure limitations accurately.
- [ ] Commit test files and measured results with `test(canvas): verify independent canvas prototype`.

## Review checkpoint

Demonstrate the prototype before proceeding to the HTML editing plan. Confirm coordinate stability, useful sketch tools, acceptable live-preview performance, and document portability. Carry any gaps into the next plan explicitly. Production saving, AI integration, migration, multiplayer restrictions, and project UI rollout remain outside this foundation deliverable and are not complete merely because this prototype passes.
