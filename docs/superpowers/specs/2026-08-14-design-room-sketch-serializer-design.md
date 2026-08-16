# Design Room — Sketch → Layout Serializer & Selection-Aware Composer (Slice 3b)

Date: 2026-08-14
Status: design approved; ready for implementation plan.

## Problem

The Design Room's premise is *sketch and talk*: you draw where things go, you say what they mean, and the agent builds the screen. Slices so far deliver the talk half — a composer generates a screen from a text instruction — and slice 3a put screens on the canvas as frames. The draw half is missing. There is no way to turn hand-drawn shapes into anything the generator can use, and the composer is not aware of what is selected or drawn on the canvas.

This slice adds the sketch half: a pure serializer that turns the shapes drawn inside a screen frame into a structured layout hint, and a selection-aware composer that folds that layout into the screen's generation. It is **purely additive** — a screen with no sketch inside it still generates from the instruction alone, exactly as today.

## The anchor decision

**The sketch says *where*; the chat says *what*.** The serializer describes placement and reports the text drawn on each shape; it never infers meaning (no "button", no "card"). Meaning is the instruction's job, and the model — given positioned, labeled boxes plus the instruction — does the semantic lift. This keeps the serializer a dumb, robust, deterministic function and avoids injecting wrong priors that fight the model.

## Decisions (settled in brainstorming)

| # | Decision |
|---|---|
| 1 | The serializer emits **ordered labeled boxes** — a flat list, no nesting. |
| 2 | **Primitives only** — each box reports `shapeKind`, `text`, coarse `position`, coarse `size`. No role guessing. |
| 3 | A sketch attaches to a screen by **containment** — sketch shapes whose bounds fall inside a screen frame are that frame's layout, normalized frame-relative. |
| 4 | Position/size are **coarse quantized buckets**, not raw coordinates, so a wobbly hand sketch produces stable output. |
| 5 | Layout is **optional and additive** — empty sketch → chat-only generation, unchanged. |
| 6 | The serializer is a **pure function in `@meld/prototype`**, beside the other pure design engines. |

## The serializer

A pure function, no tldraw editor dependency (fed plain shape data by the caller):

```
serializeSketch(
  shapes: SketchShape[],          // non-meld-meta shapes inside the frame
  frame: { x: number; y: number; w: number; h: number },
): SketchLayout
```

where:

```
type SketchShape = {
  kind: "rectangle" | "ellipse" | "line" | "text" | "other";
  x: number; y: number; w: number; h: number;   // page-space bounds
  text: string | null;                          // text drawn on/in the shape
};

type SketchLayout = {
  boxes: Array<{
    shapeKind: "rectangle" | "ellipse" | "line" | "text" | "other";
    text: string | null;
    position: {
      vertical: "top" | "middle" | "bottom";
      horizontal: "left" | "center" | "right";
    };
    size: {
      width: "narrow" | "medium" | "wide" | "full";
      height: "short" | "medium" | "tall";
    };
  }>;
};
```

Rules:

- **Frame-relative normalization.** Each shape's center and extent are computed relative to `frame`. A shape centered in the top third → `vertical: "top"`; the left third → `horizontal: "left"`; and so on (thirds for position).
- **Size buckets.** `width` by fraction of frame width: `< 0.33` narrow, `< 0.66` medium, `< 0.95` wide, else full. `height` by fraction of frame height: `< 0.2` short, `< 0.5` medium, else tall. (Exact thresholds are pinned in the plan and unit-tested.)
- **Order.** Top-to-bottom by the shape's top edge, ties broken left-to-right by left edge — reading order.
- **Text.** Reported verbatim (trimmed, bounded length). Text is the single most valuable signal; a box labelled "Start free trial" carries more than any geometry.
- **Determinism.** Same shapes + frame → identical output. No randomness, no editor state.
- **Bounds.** A capped number of boxes (e.g. ≤ 60); excess shapes beyond the cap are dropped in reading order with the cap noted, never silently truncated mid-logic.

It lives at `packages/prototype/src/sketch-layout.ts`, exported from the package index, and is validated with a Zod `SketchLayoutSchema` for the contract boundary (the generation request carries it).

## Threading the layout to generation

The layout rides the existing generation path as an optional field, parallel to the instruction:

1. **Web action.** `generateDesignScreen` (slice 2c) gains an optional `layout?: SketchLayout`. The composer serializes the target frame's contained sketch shapes and passes it.
2. **Contract.** `AIContextPackageSchema.designContext` (added in slice 2c) gains an optional `layout` field carrying the serialized `SketchLayout`, mirroring how `designContext` already carries `profileTokenCss` and `screen`. Optional — older in-flight tasks still parse.
3. **Transport.** The task RPC / hydration path that already delivers `designContext` carries `layout` unchanged (it is just more JSON inside the same context object; the 512 KiB hydrated-context cap already guards size).
4. **Prompt.** `buildDesignScreenSystemPrompt` (slice 2a) folds a layout section into the instruction when `designContext.layout` is present: it lists the boxes in order with their position/size/text and frames them as *placement guidance* — "the user sketched this layout; use it for where things go; the instruction says what each region is." Empty/absent layout → no section → chat-only, byte-identical to today.

Nothing in the connector's validation or the materialize path changes — the result is still a `DesignScreenPayload`, still gated by `findScreenSafetyViolations`, still assembled the same way. The layout only shapes the prompt.

## The selection-aware composer

The slice-2c composer generates a new screen or regenerates a built one from text. This slice makes it canvas-aware through a thin bridge, without rewriting it:

- **A selection hook** reads the tldraw editor (`editor.getSelectedShapes()`) and, for a selected screen frame, gathers the non-meld-meta shapes whose bounds fall inside that frame (the containment test 3a already established) as plain `SketchShape[]`, plus the frame bounds.
- **Targeting.** When a screen frame is selected, Generate/Regenerate targets *that* screen (its `meldScreenId`) and includes `serializeSketch(containedShapes, frameBounds)` as `layout`. Nothing selected → the existing text-only new-screen path, unchanged.
- **Affordance.** When the selected frame contains sketch shapes, the composer shows a small "▦ sketch: N shapes" indicator so it is visible that the drawing is being used. No sketch → no indicator.
- The bridge is small and isolated: a hook that produces `{ targetScreenId, sketchShapes, frameBounds } | null` from editor state, consumed by the composer. The composer's generate/regenerate/restore logic is otherwise the slice-2c component.

## Architecture & boundaries

- `packages/prototype/src/sketch-layout.ts` — pure `serializeSketch` + `SketchLayoutSchema` + types. Depends on nothing but Zod. Testable in isolation.
- `apps/web/src/features/canvas/use-canvas-selection.ts` — the editor→composer bridge hook. Depends on the tldraw editor ref (from the canvas) and the 3a containment helper. Produces plain data; no serialization logic of its own.
- `apps/web/src/features/design/design-screen-generation.ts` — `generateDesignScreen` gains the optional `layout` param and passes it to the RPC/context.
- `apps/connector/src/tasks/design-screen-generate-prompt.ts` — `buildDesignScreenSystemPrompt` gains the layout section.
- `packages/contracts/src/ai.ts` — `designContext.layout` optional field.

Each unit is small, single-purpose, and independently testable.

## Error handling

- A shape with no computable bounds or an unrecognized kind → `shapeKind: "other"`, still positioned; never throws.
- Over-cap shape counts → dropped in reading order past the cap, with the drop noted (not silent).
- A malformed/oversized layout that would breach the context cap is handled by the existing hydration size check (fail the task with the standard "context exceeds 512 KiB" error), not by the serializer.
- No sketch / no selection / view-access → no layout, chat-only path; nothing regresses.

## Testing

- **Serializer (pure, exhaustive):** position bucketing (each third), size bucketing (each threshold boundary), reading order (including ties), frame-relative normalization at different frame origins/sizes, text trimming/bounding, the box cap, and determinism. Same approach as the other `@meld/prototype` pure engines.
- **Prompt folding (pure string):** layout present → the section lists boxes in order with position/size/text; layout absent → byte-identical to the chat-only prompt.
- **Contract:** `SketchLayoutSchema` accepts a valid layout, rejects bad buckets; `AIContextPackageSchema.designContext.layout` is optional and round-trips.
- **Selection bridge + end to end:** one e2e (canvas-trial harness, consistent with 3a) — draw shapes inside a screen frame, Generate, and assert the serialized layout reaches the (fake) generation and the "sketch: N shapes" affordance appears. The bridge hook's containment/selection logic gets a focused unit test where the editor can be faked.

## Scope

**In:** the pure serializer + contract; threading `layout` through the web action, the `designContext` contract, and the prompt; the selection-aware composer bridge + affordance; tests.

**Deliberately out:** nested/region-tree layouts (decision #1 — add only if flat proves too weak); role/semantic inference (decision #2 — that is the model's job); non-containment attachment such as free selection (decision #3); the unified history drawer and Define-flow seeding (slice 3c); the promoted-vs-versionId concurrency-gate decision (still deferred; revisit when canvas generation concurrency grows).

This is one focused, single-plan slice building directly on 2a's prompt, 2c's generation path, and 3a's canvas frames.
