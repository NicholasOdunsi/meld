# Design Room Slice 3a — Canvas & Screen Projection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the room's "User Flows" tab into the **Canvas** where design screens appear as frames alongside flows — each built screen previewed live in a sandboxed overlay anchored to its frame — so the prototype the composer generates is visible on the same canvas the flow lives on.

**Architecture:** The Supabase `design_screens` row is authoritative; the tldraw `frame` shape (built-in, carrying `meta.meldScreenId`) is a recoverable projection created client-side via the already-wired `editor.store.put` pattern. A pure reconciliation function diffs rows against frames; a canvas effect applies the diff after the store syncs. Each built screen's current version renders in an **inert sandboxed iframe** positioned over its frame via a new tldraw `InFrontOfTheCanvas` overlay. No custom tldraw shape type; no gateway change.

**Tech Stack:** Next.js App Router, tldraw 5.3.0, `@astryxdesign/core`, `@supabase/ssr`, TypeScript 5.9.3, Zod 4.4.3, vitest, Playwright, Node 22.23.2.

**Design spec:** `docs/superpowers/specs/2026-08-13-design-room-design.md`
**Canvas research (read for context):** `.context/slice-3a-research.md`
**Builds on:** slice-1 tables (`design_screens`/`design_screen_versions` with `canvas_x/y`, `flow_node_id`, `state`, `current_version_id`), slice-2b `@meld/prototype` (`assembleValidatedPrototype`, `PROTOTYPE_CSP`, `DesignScreenPayload`), slice-2c server actions.

## Global Constraints

- Node `>=22.23.2`, tldraw pinned exactly `5.3.0` (web + gateway), Zod `4.4.3`, TS `5.9.3`. Never change versions. **Do not register a custom tldraw shape type** — a screen is a built-in `frame` with `meta.meldScreenId` (both processes use bare `createTLSchema()`; a custom type would need a shared schema + room migration).
- The **surface key stays `user-flows`** (URLs, `?tab=`, tests, broadcast plumbing depend on it). Only the **label** changes to "Canvas", plus user-visible copy strings. Do not rename files, components, or identifiers.
- **The web client creates/updates frames via `editor.store.put(records)` inside `editor.run(...)`** with deterministic ids `createShapeId(\`screen-${meldScreenId}\`)` — the proven `applyGeneratedFlow` pattern. Do NOT call the gateway's `insertScreenFrame` (it is a test-only, unwired server method).
- The screen row is authoritative; the frame is a recoverable projection. Reconciliation never deletes a screen row from the canvas side; an orphan frame (meta id with no row) is marked/removed, never silently trusted. Reconciliation runs only once `store.status === "synced-remote"` (same gate as `shouldSeedJourneyFlow`).
- Screen preview overlays render in an iframe with `sandbox=""` (inert — no `allow-scripts`, no `allow-same-origin`) so canvas previews never execute generated JS (slice-0 constraint; the interactive run is the Prototype viewer). Assemble each preview with `assembleValidatedPrototype` (the hardened gate).
- `apps/web/src` obeys `check:astryx` (no raw `<div>`/`<span>`, no hex/rgb, no bare px, no Tailwind) — `@astryxdesign/core` primitives + `var(--color-…)`. The `<iframe>` element is allowed; size it with `100%`/computed values, not px literals in a way the checker rejects (compute positions in JS, apply via a style object of numeric `left/top/width/height` — the checker flags *literal* px in source, not computed numbers; verify with `pnpm check:astryx`).
- Editor/tldraw code only runs client-side (`"use client"`, `ssr:false` dynamic import already in place).

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/web/src/features/rooms/room-tabs.ts` | Relabel `user-flows` → "Canvas". |
| `apps/web/src/features/rooms/components/room-tab-strip.tsx` | Tab reads the label from the map (or literal → "Canvas"). |
| `apps/web/src/features/canvas/user-flow-trial-tab-loader.tsx`, `user-flow-trial-tab.tsx`, `user-flow-trial-unavailable.tsx`, `user-flow-trial-canvas.tsx`, `apps/web/src/features/prd/components/prd-editor.tsx` | User-visible "User Flows" copy → "Canvas". |
| `e2e/room-lifecycle.spec.ts` | Update the "User Flows" link assertions to "Canvas". |
| `apps/web/src/features/design/canvas-screen-reader.ts` | `listRoomCanvasScreens(roomId)` — screens with position + per-built-screen renderable content. |
| `apps/web/src/features/design/canvas-screen-reader.test.ts` | Reader tests. |
| `apps/web/src/features/canvas/screen-frame-reconcile.ts` | Pure `reconcileScreenFrames(frames, rows)` → `{ toCreate, orphans }`; `screenFrameRecord(row)` builds the frame `TLRecord`. |
| `apps/web/src/features/canvas/screen-frame-reconcile.test.ts` | Reconciliation unit tests. |
| `apps/web/src/features/canvas/screen-overlay-geometry.ts` | Pure `overlayRectForFrame(bounds, camera)` → `{ left, top, width, height }`. |
| `apps/web/src/features/canvas/screen-overlay-geometry.test.ts` | Geometry unit tests. |
| `apps/web/src/features/canvas/screen-frame-overlay.tsx` | `InFrontOfTheCanvas` overlay: inert iframe per screen frame. |
| `apps/web/src/features/canvas/user-flow-trial-canvas.tsx` | Wire the reconcile effect + the overlay + the ▶ Preview control into `<Tldraw>`. |
| `apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.tsx` | Fetch canvas screens for `activeSurface === "user-flows"`, pass down. |
| `e2e/design-canvas.spec.ts` | A built screen projects as a frame with a preview overlay on the Canvas. |

---

### Task 1: Relabel "User Flows" → "Canvas"

**Files:** `room-tabs.ts`, `room-tab-strip.tsx`, the copy strings, `e2e/room-lifecycle.spec.ts`; Test: `apps/web/src/features/rooms/room-tabs.test.ts` (or the tab-strip test).

**Interfaces:** none produced. Surface key `user-flows` unchanged; label + user-facing copy now "Canvas".

- [ ] **Step 1: Failing test**

Add/adjust a test asserting `ROOM_SURFACE_LABELS["user-flows"] === "Canvas"` and (in the tab-strip test) that the User-Flows tab renders label "Canvas".

- [ ] **Step 2: Run → fail**

Run: `npx vitest run room-tabs room-tab-strip`  Expected: FAIL (still "User Flows").

- [ ] **Step 3: Implement**

- `room-tabs.ts`: `"user-flows": "Canvas"`.
- `room-tab-strip.tsx:58-66`: change `label="User Flows"` → `label={ROOM_SURFACE_LABELS["user-flows"]}` (import the map; prefer reading the map over a second literal), keep `value="user-flows"`, `href` and icons unchanged.
- User-visible copy → "Canvas": `user-flow-trial-tab-loader.tsx:16` ("Loading User Flows" → "Loading Canvas"), `user-flow-trial-tab.tsx:70,90` ("Unable to open User Flows"/"Connecting to User Flows" → "…Canvas"), `user-flow-trial-unavailable.tsx:9` ("User Flows is unavailable" → "Canvas is unavailable"), `user-flow-trial-canvas.tsx:279` ("Syncing User Flows" → "Syncing Canvas"), `prd-editor.tsx:740` ("authored on the User Flows canvas" → "authored on the Canvas"). Leave code comments and identifiers alone.
- `e2e/room-lifecycle.spec.ts:193,223,279,409`: `getByRole("link", { name: "User Flows" })` → `{ name: "Canvas" }`.

- [ ] **Step 4: Run**

Run: `npx vitest run room-tabs room-tab-strip && pnpm --filter web typecheck && pnpm check:astryx`  Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/rooms/room-tabs.ts apps/web/src/features/rooms/components/room-tab-strip.tsx \
        apps/web/src/features/canvas/user-flow-trial-tab-loader.tsx apps/web/src/features/canvas/user-flow-trial-tab.tsx \
        apps/web/src/features/canvas/user-flow-trial-unavailable.tsx apps/web/src/features/canvas/user-flow-trial-canvas.tsx \
        apps/web/src/features/prd/components/prd-editor.tsx e2e/room-lifecycle.spec.ts apps/web/src/features/rooms/room-tabs.test.ts
git commit -m "feat(web): relabel the room User Flows surface to Canvas"
```

---

### Task 2: Canvas screen reader

**Files:** Create `apps/web/src/features/design/canvas-screen-reader.ts` + test.

**Interfaces:**
- Produces: `listRoomCanvasScreens(roomId): Promise<CanvasScreen[]>` where `CanvasScreen = { id; name; canvasX; canvasY; flowNodeId: string|null; state: "empty"|"built"; preview: DesignScreenPayload | null }`. For built screens, `preview` is the current version's `{markup,styles,script,actions}`; empty screens → `preview: null`. Fake-gated (`isRoomFakeEnabled()`) like the other design readers.

- [ ] **Step 1: Failing test**

Create the test mirroring `prototype-reader.test.ts` mocking: two screens (one built with a current version, one empty) → `listRoomCanvasScreens` returns both with `canvasX/Y`, the built one carrying `preview` with the version markup, the empty one `preview: null`; RLS/error → `[]`. Include a fake-mode case returning `fakeListRoomCanvasScreens`.

- [ ] **Step 2: Run → fail** — `npx vitest run canvas-screen-reader` → module not found.

- [ ] **Step 3: Implement**

Read `design_screens` (`id,name,canvas_x,canvas_y,flow_node_id,state,current_version_id`, not deleted) and, for rows with a `current_version_id`, the matching `design_screen_versions` (`id,markup,styles,script,actions_json`) — one `.in("id", currentVersionIds)` query, mapped to `preview`. Follow `prototype-reader.ts` conventions exactly: `isRoomFakeEnabled()` branch to `fakeListRoomCanvasScreens` (add it to `e2e-fake.ts` mirroring `fakeListRoomPrototypeScreens`), `createClient(new Headers())`, strict `safeParse`, `console.error`+`[]` on failure. `actions_json` already matches the `DesignScreenPayload.actions` shape.

- [ ] **Step 4: Run** — `npx vitest run canvas-screen-reader && pnpm --filter web typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/design/canvas-screen-reader.ts apps/web/src/features/design/canvas-screen-reader.test.ts apps/web/src/features/rooms/e2e-fake.ts
git commit -m "feat(web): canvas screen reader with per-screen preview payload"
```

---

### Task 3: Pure reconciliation engine

**Files:** Create `apps/web/src/features/canvas/screen-frame-reconcile.ts` + test.

**Interfaces:**
- Produces:
  - `screenFrameId(meldScreenId: string): string` — `createShapeId(\`screen-${meldScreenId}\`)`.
  - `screenFrameRecord(input: { id: string; name: string; x: number; y: number; pageId: string; index: string }): TLFrameShape` — the projected frame (props `{ w: 390, h: 844, name: input.name, color: "black" }`, `meta: { meldScreenId: input.id }`).
  - `reconcileScreenFrames(existingFrames: { id: string; meldScreenId: string | null }[], rows: { id: string; name: string; canvasX: number; canvasY: number }[]): { toCreate: string[]; orphans: string[] }` — `toCreate` = row ids with no matching frame; `orphans` = frame shape ids whose `meldScreenId` matches no row. Pure — no tldraw editor.

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from "vitest";
import { reconcileScreenFrames, screenFrameId } from "./screen-frame-reconcile";

describe("reconcileScreenFrames", () => {
  it("creates frames for rows without a projection", () => {
    const r = reconcileScreenFrames([], [{ id: "s1", name: "A", canvasX: 0, canvasY: 0 }]);
    expect(r.toCreate).toEqual(["s1"]);
    expect(r.orphans).toEqual([]);
  });
  it("leaves an already-projected row alone", () => {
    const r = reconcileScreenFrames(
      [{ id: screenFrameId("s1"), meldScreenId: "s1" }],
      [{ id: "s1", name: "A", canvasX: 0, canvasY: 0 }],
    );
    expect(r.toCreate).toEqual([]);
    expect(r.orphans).toEqual([]);
  });
  it("flags a frame whose screen row is gone as an orphan", () => {
    const r = reconcileScreenFrames(
      [{ id: screenFrameId("gone"), meldScreenId: "gone" }],
      [],
    );
    expect(r.orphans).toEqual([screenFrameId("gone")]);
  });
  it("ignores non-screen frames (no meldScreenId)", () => {
    const r = reconcileScreenFrames([{ id: "shape:flow-frame", meldScreenId: null }], []);
    expect(r.toCreate).toEqual([]);
    expect(r.orphans).toEqual([]);
  });
});
```

- [ ] **Step 2: Run → fail** — module not found.

- [ ] **Step 3: Implement** — pure set-diff. `screenFrameRecord` builds the `TLFrameShape` (import `TLFrameShape` from `@tldraw/tlschema`, `createShapeId` from `tldraw`/`@tldraw/editor`; match `insertScreenFrame`'s prop shape). Keep it free of any editor instance so it unit-tests cleanly.

- [ ] **Step 4: Run** — `npx vitest run screen-frame-reconcile && pnpm --filter web typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/canvas/screen-frame-reconcile.ts apps/web/src/features/canvas/screen-frame-reconcile.test.ts
git commit -m "feat(canvas): pure screen-frame reconciliation engine"
```

---

### Task 4: Overlay geometry

**Files:** Create `apps/web/src/features/canvas/screen-overlay-geometry.ts` + test.

**Interfaces:**
- Produces: `overlayRectForFrame(pageBounds: { x: number; y: number; w: number; h: number }, viewportScreenBounds: { x: number; y: number }, camera: { x: number; y: number; z: number }): { left: number; top: number; width: number; height: number }` — converts a frame's page-space bounds to viewport-relative CSS pixels using tldraw's page→screen transform (`screen = (page + camera) * z`, offset by the viewport's screen origin). Pure.

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from "vitest";
import { overlayRectForFrame } from "./screen-overlay-geometry";
it("maps page bounds to screen rect at zoom 1, no pan", () => {
  const r = overlayRectForFrame({ x: 100, y: 50, w: 390, h: 844 }, { x: 0, y: 0 }, { x: 0, y: 0, z: 1 });
  expect(r).toEqual({ left: 100, top: 50, width: 390, height: 844 });
});
it("applies camera pan and zoom", () => {
  const r = overlayRectForFrame({ x: 100, y: 50, w: 390, h: 844 }, { x: 0, y: 0 }, { x: -50, y: -10, z: 2 });
  // screen = (page + camera) * z  →  left=(100-50)*2=100, top=(50-10)*2=80, w=390*2=780
  expect(r).toEqual({ left: 100, top: 80, width: 780, height: 1688 });
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement** — `left = (pageBounds.x + camera.x) * camera.z - viewportScreenBounds.x`, same for top; `width = pageBounds.w * camera.z`, `height = pageBounds.h * camera.z`. (This mirrors what `editor.pageToScreen` does; keeping it pure lets us test it without an editor. Task 5 feeds it `editor.getShapePageBounds(frameId)`, `editor.getViewportScreenBounds()`, and `editor.getCamera()`.)

- [ ] **Step 4: Run** — PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/canvas/screen-overlay-geometry.ts apps/web/src/features/canvas/screen-overlay-geometry.test.ts
git commit -m "feat(canvas): pure page→screen overlay geometry"
```

---

### Task 5: The screen-frame overlay component

**Files:** Create `apps/web/src/features/canvas/screen-frame-overlay.tsx` + a light test.

**Interfaces:**
- Produces: `ScreenFrameOverlay({ screens }: { screens: CanvasScreen[] })` — a tldraw `InFrontOfTheCanvas` child that, using `useEditor()` + `track()` (reactive to camera/shape changes), renders for each frame shape carrying `meta.meldScreenId` an inert iframe (`sandbox=""`) positioned via `overlayRectForFrame(editor.getShapePageBounds(frameId)!, editor.getViewportScreenBounds(), editor.getCamera())`, with `srcDoc` = `assembleValidatedPrototype({ screens: [thatScreenPayload], startScreenId: id, tokenCss })` for built screens, or an astryx empty-state chip for empty screens. A small ▶ button on each built frame calls a passed `onPreview(screenId)`.

Design notes:
- Import `InFrontOfTheCanvas` and `useEditor`, `track` from `tldraw`. `track(...)` makes the component re-render on editor state changes (camera pan/zoom, shape moves) so overlays follow their frames. This is a NEW pattern in this repo (research §6) — mount it via `<Tldraw components={{ InFrontOfTheCanvas: ScreenFrameOverlay }}>` in Task 6, or as a child; follow tldraw 5.3.0's `TLComponents` API.
- Assemble a **single-screen** inert document per frame. Reuse `tokenCss` if the reader provides it; else `""` (a later task can thread the profile token css like slice 2c did for the viewer).
- Positioning uses computed numbers in the style object (not literal px in source) to stay astryx-clean.

- [ ] **Step 1: Write a focused test**

Full tldraw rendering is impractical to unit-test. Test the *pure* seam instead: assert `ScreenFrameOverlay` builds an inert srcDoc via `assembleValidatedPrototype` for a built screen (extract the doc-building into a pure helper `buildFramePreviewDoc(screen, tokenCss)` in this file and unit-test THAT: built screen → contains its markup + `PROTOTYPE_CSP`; empty screen → returns null). The geometry is already tested (Task 4). Leave the tldraw-wired rendering to the e2e (Task 7).

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement** — `buildFramePreviewDoc` (pure, tested) + the `track()`ed overlay component (wired, e2e-covered). The iframe is always `sandbox=""` (never scripts) with `title` naming the screen.

- [ ] **Step 4: Run** — `npx vitest run screen-frame-overlay && pnpm --filter web typecheck && pnpm check:astryx` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/canvas/screen-frame-overlay.tsx apps/web/src/features/canvas/screen-frame-overlay.test.tsx
git commit -m "feat(canvas): inert screen preview overlay anchored to frames"
```

---

### Task 6: Wire reconciliation + overlay + preview into the canvas

**Files:** Modify `apps/web/src/features/canvas/user-flow-trial-canvas.tsx`, `apps/web/src/features/canvas/user-flow-trial-tab.tsx` (+ loader prop passthrough), `apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.tsx`.

**Interfaces:** the Canvas surface now projects design screens as frames and previews them; a ▶ Preview control opens the Prototype viewer.

- [ ] **Step 1: Fetch + thread the screens prop**

In `page.tsx`, when `activeSurface === "user-flows"`, call `listRoomCanvasScreens(roomId)` (alongside the existing `seedFlow`), and pass `canvasScreens` down through `UserFlowTrialTab` → `UserFlowTrialCanvas` (mirror how `seedFlow` is threaded, research §5). Add the prop to both components' types.

- [ ] **Step 2: Reconcile effect**

In `UserFlowTrialCanvas`, add an effect that — after `waitForEditor()` and once `store.status === "synced-remote"` and `access === "edit"` — enumerates `editor.getCurrentPageShapes()` for frames with `meta.meldScreenId`, calls `reconcileScreenFrames(...)`, and for each `toCreate` id does `editor.run(() => editor.store.put([screenFrameRecord({ id, name, x: canvasX, y: canvasY, pageId: editor.getCurrentPageId(), index: getIndexAbove(editor.getHighestIndexForParent(pageId)) })]))` — the exact `applyGeneratedFlow` write pattern (research §2). Orphans: mark them (e.g., set `meta.meldOrphan = true` for the overlay to show a "removed" affordance) rather than deleting on first pass; do not delete a user-moved frame silently. Guard against re-running (a `reconciledRef`), and skip in `view` access.

- [ ] **Step 3: Mount the overlay + preview control**

Pass `components={{ InFrontOfTheCanvas: () => <ScreenFrameOverlay screens={canvasScreens} onPreview={openPreview} /> }}` to `<Tldraw>` (or render the overlay as a child using the editor context). Add a ▶ **Preview prototype** control (astryx `Button`, top-right of the canvas chrome) that navigates to `?tab=prototype` (the slice-2b viewer). `openPreview(screenId)` navigates to `?tab=prototype` (slice 3 can later deep-link a start screen).

- [ ] **Step 4: Run the web suite + checks**

Run: `pnpm --filter web test && pnpm --filter web typecheck && pnpm check:astryx && pnpm --filter web lint`  Expected: PASS (existing user-flow canvas tests must still pass — the flow path is untouched).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/canvas/user-flow-trial-canvas.tsx apps/web/src/features/canvas/user-flow-trial-tab.tsx \
        apps/web/src/features/canvas/user-flow-trial-tab-loader.tsx "apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.tsx"
git commit -m "feat(canvas): project design screens as frames with live previews and a prototype preview control"
```

---

### Task 7: End-to-end — a built screen shows on the Canvas

**Files:** Create `e2e/design-canvas.spec.ts`.

**Interfaces:** proves the projection + overlay in a real browser.

- [ ] **Step 1: Write the spec**

Follow `e2e/user-flow-trial.spec.ts` (canvas session harness) AND the in-memory fake pattern confirmed in slice 2c (the whole e2e suite runs on `isRoomFakeEnabled()` — seed via the `FakeRoomStore`, add a `fakeListRoomCanvasScreens` seeding path). Seed a room with one **built** design screen (a `FakePrototypeScreen`/version with known markup) at a known `canvas_x/y`. Open the room on `?tab=user-flows` (now labelled "Canvas"). Assert: the Canvas tab label is "Canvas"; the screen's preview overlay iframe appears (`frameLocator` on the inert preview, containing the seeded markup); the ▶ Preview control is present. **Because canvas rendering + tldraw sync is timing-sensitive and runs against the canvas gateway, budget generously and gate on the overlay's `frameLocator` content, not on pixel positions.**

Note on harness: the canvas needs the gateway sync (`e2e/user-flow-trial.spec.ts` uses `playwright.canvas-trial.config.ts` with a real gateway + `MELD_CANVAS_SESSION_SECRET`). If projecting a screen frame requires the reconcile effect to run against a real synced store, use that canvas-trial config path rather than the default fake config. If wiring both the room fake AND the canvas gateway proves disproportionate, seed the frame shape directly server-side via the gateway room and assert the overlay renders — but do not fabricate a pass; if blocked, report the exact harness gap (mirror how slice 2c's e2e was ultimately driven).

- [ ] **Step 2: Run**

Run (free port; kill stale owners first): `MELD_E2E_PORT=3991 pnpm exec playwright test e2e/design-canvas.spec.ts --reporter=line` (background it, poll a log — cold Turbopack compile is slow). Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add e2e/design-canvas.spec.ts
git commit -m "test(e2e): design screens project onto the Canvas with a preview overlay"
```

---

## Definition of done

- The room tab reads **Canvas**; the surface key stays `user-flows`; `check:astryx`, `pnpm --filter web test`, `typecheck`, `lint` pass.
- Pure engines unit-tested: reconciliation (create/orphan/dedupe) and overlay geometry (pan/zoom).
- A built `design_screen` projects as a `frame` (built-in, `meta.meldScreenId`, created via `editor.store.put`) and previews live in an inert `sandbox=""` iframe anchored to the frame; an empty screen shows a placeholder; the ▶ Preview control opens the slice-2b viewer.
- The existing user-flow canvas path (flow generation, seeding, journey sync) is untouched and its tests still pass.
- `e2e/design-canvas.spec.ts` proves the projection + overlay in-browser.

**Deferred to later slice-3 parts:** the free-form **sketch → layout serializer** and the **selection-aware composer** (slice 3b — needs a short design pass on the layout schema first); the **unified history drawer** over `design_screen_events` and **Define-flow seeding** of screen frames (slice 3c); threading the active profile `token_css` into canvas previews; and the slice-2c-flagged **promoted-vs-versionId gate** decision (resolve when 3b/3c add agent-driven concurrency on the canvas).
