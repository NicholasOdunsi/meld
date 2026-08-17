# Canvas screen naming + multi-screen selection — design

Date: 2026-08-17
Status: Approved (brainstorm), pending spec review
Feature flag: `MELD_USER_FLOW_TRIAL_ENABLED` (existing canvas trial, dev-only)

## Problem

Two rough edges in the User-Flows canvas ("Canvas" tab):

1. **Generated screen frames show a generic name.** A newly created screen is inserted
   with the default name `"Screen"` (`create_design_screen`'s caller passes
   `parsed.data.name ?? "Screen"` — `design-screen-generation.ts:70`). Generation never
   writes a real name back, so after the agent has effectively figured out what the page
   is, the frame still reads "Screen". The canvas frame label is just
   `props.name = screen.name` (`screen-frame-reconcile.ts:73`).

2. **You can only target a screen by selecting the bare frame.** `useCanvasSketchSelection`
   hard-gates to exactly one selected frame (`use-canvas-selection.ts:95`,
   `if (screenFrames.length !== 1) return null`). Selecting the rendered screen or the
   sketch shapes you drew does nothing, and there's no visible indication in the composer
   of *which* screen the agent will act on — only a faint `sketch: N shapes` badge.

## Goals

- **F1 — Page names.** The agent emits a human page name per generated screen; that name
  is persisted onto the screen row so the canvas frame auto-relabels (e.g. "Vehicle Pool",
  "Checkout — Confirm"). Never clobber a name the user set by hand.
- **F2 — Multi-screen selection → composer chips → fan-out.** Selecting one or more screens
  on the canvas (the frame, its rendered preview, or the sketch drawn inside it) surfaces
  each as a removable **attachment chip** in the composer, styled like attaching a
  file/image. On Generate, each selected screen is edited in **its own task**, following
  **its own sketch**.

## Non-goals

- Reference images / dropped screenshots as visual guidance (deferred; the earlier
  option "C"). Selection targets *existing screens on the canvas* only.
- Vision-model understanding of the raw drawing (still out of scope — the sketch remains a
  coarse positional layout, per `serializeSketch`).
- Cross-screen "edit all of these as one batch prompt". Fan-out is N independent tasks, one
  per screen, each with its own instruction copy + own sketch.

---

## Feature 1 — page names (decision: model emits a real name; "1b")

### Why not derive from `screenKey`
`screenKey` is a link slug (`login`, `vehicle_pool`) the model chooses for *linking*, not
display. Title-casing it gives terse/robotic labels. The layout branch already carries a
model-supplied `create.name` (`screen-payload.ts:61`) and the materializer already coalesces
it (`202608150013_materialize_layouts.sql:217-221`) — we mirror that proven pattern for
screens.

### Changes

**1. Payload schema — `packages/prototype/src/screen-payload.ts`**
Add an optional `name` to `DesignScreenPayloadSchema` (kept optional so already-persisted
payloads, e2e fakes, and hand-written literals still parse):
```
name: z.string().trim().min(1).max(120).optional(),
```
Bounds mirror the DB constraint (`design_screens.name`: `char_length(btrim(name)) between 1
and 120`, `202608130006_design_screens.sql:7`). `.strict()` on the schema means the field
must be declared here or a model-emitted `name` would be rejected.

**2. Connector response schema + prompt — `apps/connector/src/tasks/design-screen-generate-prompt.ts`**
- Add `name` to the per-screen `required` list (currently lines 149-157) and `properties`
  (after line 159): `name: { type: "string", minLength: 1, maxLength: 120 }`. Required so
  every *generated* screen carries a display name (persisted payloads stay lenient via the
  optional zod field in step 1).
- Add a prompt instruction near the existing screenKey rule (line ~22): each screen must
  also carry a short human **name** — the page's real title (e.g. "Vehicle Pool"), Title
  Case, ≤120 chars, distinct from the slug `screenKey`.

**3. DB apply path — new migration redefining `materialize_design_screen_generate`**
Follow `202608150013_materialize_layouts.sql` (the live definition). Two edits inside the
per-screen loop:
- **New sibling INSERT** (currently name is slug-derived at lines 161-164): prefer the
  model name, fall back to the existing slug logic:
  ```
  coalesce(
    nullif(btrim(elem ->> 'name'), ''),
    nullif(initcap(replace(screen_key_val, '-', ' ')), ''),
    'Screen ' || (idx + 1)
  )
  ```
- **Target / existing screen** (no name UPDATE exists today): add, alongside the version
  write (~lines 274-290, mirroring the `layout_id` update at 286-290):
  ```
  update public.design_screens
     set name = nullif(btrim(elem ->> 'name'), '')
   where id = <resolved screen id>
     and btrim(name) = 'Screen';         -- only upgrade the default placeholder
  ```

### Placeholder rule (never clobber a hand-set name)
The UPDATE is **guarded to only fire when the current name is exactly the default
`'Screen'`**. Consequences:
- New screen created via the composer (default `"Screen"`) → adopts the model name on
  generation. ✅ (the reported complaint)
- Flow-seeded screens (named from the flow node, e.g. "Login") → **preserved**.
- Any name the user typed → **preserved**.
- New sibling screens → always take the model name (they have no prior name).

This is a pure string guard — no new column, no `name_is_custom` flag. If we later want
"user renamed" tracking, that's a separate change.

---

## Feature 2 — multi-screen selection, chips, fan-out

### 2a. Selection: one screen → many (`use-canvas-selection.ts`)

Replace the single-object result with an **array**, one entry per resolved screen.

New shape:
```
export type CanvasScreenSelection = {
  targetScreenId: string;
  frame: Bounds;
  sketchShapes: SketchShape[];
};
// hook now returns CanvasScreenSelection[]  (empty array = nothing targeted)
```

New resolution rules in `canvasSketchSelection` (pure, still unit-testable):
1. From `getSelectedShapes()`, split into **selected screen frames** (`isScreenFrame`) and
   **selected non-flow, non-frame shapes** ("loose sketch shapes").
2. **Target set** = the union of:
   - every selected screen frame's screen, **plus**
   - the containing frame of every selected loose sketch shape. A loose shape resolves to a
     frame when its center is inside that frame's page bounds (`shapeCenterInFrame`) — the
     same containment test already used in reverse. This is how "highlight + select the
     sketch" targets its screen without selecting the frame. Selecting the rendered preview
     already selects the frame beneath it (the overlay is `pointerEvents:"none"`), so no
     special handling needed.
3. For each targeted screen, gather its `sketchShapes` exactly as today: iterate
   `getCurrentPageShapes()`, keep non-frame/non-flow shapes whose center is inside *that*
   frame. (A co-selected sketch is naturally grouped under its screen — "treat as one"
   falls out of this; the chip shows one screen with its shape count, not N chips.)
4. Dedupe by screen id. Order by `frame.x` then `frame.y` for stable chip order.
5. A selected loose shape not inside any frame is ignored (can't attribute it to a screen).

Frames with no drawn sketch still resolve (empty `sketchShapes`) — selecting a bare frame is
still a valid "edit this screen" target.

### 2b. Composer chips (`screen-composer.tsx`)

- `selection` prop becomes `CanvasScreenSelection[]`.
- Local state `dismissedScreenIds: Set<string>` — removing a chip prunes that screen from
  the *effective* target set for this composer session. Cleared when the underlying
  selection changes (new canvas selection = fresh chip set). (We prune in composer state
  rather than mutating the tldraw selection, so an ✕ doesn't fight the canvas.)
- `effectiveTargets = selection.filter(s => !dismissedScreenIds.has(s.targetScreenId))`.
- Replace the single `Badge` (lines 317-323) with an `HStack` of chips rendered in the same
  bottom `VStack` above `<ChatComposer>`. One chip per effective target:
  - Label = screen name, resolved from `canvasScreens` (`new Map(canvasScreens.map(s =>
    [s.id, s]))` → `.name`). Fallback to "Screen" if not found.
  - If that screen has `sketchShapes.length > 0`: append `· following your sketch (N)`.
  - Chip carries an ✕ (astryx `Badge`/`Chip` with a dismiss affordance, matching the
    existing DS; if `Badge` lacks a remove slot, use the closest chip component or a
    `Badge` + adjacent icon button).
  - Styled to read as an attachment row (like attaching a file/image).
- Empty `effectiveTargets` → no chips; composer behaves as "create a new screen" (unchanged
  path).

### 2c. Fan-out generation

The generation hook (`use-design-screen-generation.ts`) currently tracks a **single**
`taskId`/`status` with one poll effect (lines 41-179) — calling `start` N times clobbers
state. Refactor to track a **set** of in-flight tasks:

- Internal state becomes a `Map<taskId, status>` (or `Set<taskId>` of active ids, since the
  transcript already renders per-screen turns). Poll each active task; drop it on terminal
  status. Reuse the existing single-task poll logic, generalized over the set.
- `isGenerating = activeCount > 0` (drives input disable + transcript poll, as today).
- Expose `startMany(inputs: GenerateInput[])` (keep `start` for the create-new path).
- Adoption of externally-queued tasks (lines 81-103) already reads
  `activeDesignScreenGenerationTaskIds` as an **array** — generalize that seam to seed the
  set instead of `[0]`.

`submit()` (lines 237-275):
- If `effectiveTargets.length === 0`: single `generation.start({ instruction, ... })`
  (create new screen) — unchanged.
- Else: one optimistic turn per target, then
  ```
  generation.startMany(effectiveTargets.map(t => ({
    screenId: t.targetScreenId,
    instruction: trimmed,
    provider, model,
    layout: t.sketchShapes.length ? serializeSketch(t.sketchShapes, t.frame) : undefined,
    context: generationContext,
  })))
  ```
  Each element is an independent `create_design_screen_generate_task` call — the per-screen
  advisory lock (`202608130010_design_task_rpcs.sql`) makes concurrent tasks on distinct
  screens safe.

### Partial failure
Each fanned-out task is independent. If one `generateDesignScreen` call errors, the others
still queue; the failing screen's optimistic turn resolves to a failed turn via the normal
transcript refresh. `isGenerating` stays true until the set drains. No all-or-nothing
rollback — one bad screen must not block the rest (mirrors the connector's per-screen
degrade philosophy in `screen-payload.ts:106-114`).

---

## Data flow (end to end)

**F1:** model emits `screens[].name` → connector validates (`DesignScreenBatchSchema`) →
`result_json.payload.screens[]` → `materialize_design_screen_generate` writes/updates
`design_screens.name` (guarded) → canvas reconcile sets `frame.props.name = screen.name`
→ frame relabels.

**F2:** user selects screens/sketches → `canvasSketchSelection` returns
`CanvasScreenSelection[]` → composer renders removable chips → Generate fans out one
`generateDesignScreen` per effective target (each with its own sketch layout) → N tasks →
each materializes to its screen.

## Testing

**Unit (pure, no DB — fast):**
- `serializeSketch` / `formatSketchLayoutForPrompt` — unchanged, still green.
- `canvasSketchSelection` (`use-canvas-selection.test.ts`): new cases — two selected frames
  → two entries; a selected loose sketch shape (frame not selected) → resolves to its
  containing screen with that shape attached; a co-selected multi-shape sketch → one screen
  entry with N shapes; a selected shape outside all frames → ignored; dedupe.
- Composer chip logic: effective-targets filtering, chip label + sketch suffix, dismiss.
- Generation hook: `startMany` tracks multiple tasks; `isGenerating` reflects the set;
  terminal status drains one without dropping others.

**SQL (`supabase test db`):**
- New migration: sibling INSERT prefers model `name`, falls back to slug; target UPDATE
  fires only when current name is `'Screen'`; a flow-seeded / user-named screen is NOT
  overwritten; the 1-120 trimmed constraint holds.
- Connector-enum/arity parity checks stay green.

**E2E (`playwright.canvas-trial.config.ts`, fake connector):**
- Extend `design-sketch-generate.spec.ts` (or a sibling): the generated frame relabels to
  the fake's emitted name; selecting two frames shows two chips; ✕ removes a chip; Generate
  with two targets queues two tasks (two optimistic turns / two building screens).
- The fake generator (`e2e-fake.ts`) must emit a `name` per screen so F1 is observable.

## Files touched (from the two maps)

- `packages/prototype/src/screen-payload.ts` — add `name`.
- `apps/connector/src/tasks/design-screen-generate-prompt.ts` — schema + prompt.
- `supabase/migrations/2026081700NN_design_screen_name.sql` — new; redefine
  `materialize_design_screen_generate` (based on `202608150013`).
- `apps/web/src/features/canvas/use-canvas-selection.ts` — array selection + loose-shape
  resolution.
- `apps/web/src/features/design/components/screen-composer.tsx` — chips, dismiss, fan-out.
- `apps/web/src/features/design/use-design-screen-generation.ts` — multi-task tracking +
  `startMany`.
- `apps/web/src/features/rooms/e2e-fake.ts` — fake emits `name`; supports multi-target.
- Tests colocated with each (`use-canvas-selection.test.ts`, composer test, hook test) +
  SQL test + e2e spec.

## Risks / decisions

- **Placeholder guard is a literal `'Screen'` match.** Simple and safe; a screen renamed
  back to exactly "Screen" would get re-adopted (acceptable). Alternative (a `name` source
  column) is deferred.
- **Hook refactor to multi-task** is the largest single change; it's contained to one hook
  and its consumer. The room-task-status projection already exposes an array of active ids,
  so the plumbing exists.
- **Chip component**: depends on what `@astryxdesign/core` offers for a removable chip;
  fallback is `Badge` + adjacent dismiss icon. Confirm during implementation.
- **`name` required in the connector schema** but optional in the zod payload — intentional:
  new generations must name screens; old persisted payloads must still parse.
