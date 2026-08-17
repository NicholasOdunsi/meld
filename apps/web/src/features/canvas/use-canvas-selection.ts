import type { RefObject } from "react";
import { shapeCenterInFrame, type SketchShape } from "@meld/prototype";
import { useValue, type Editor } from "tldraw";

// The canvas-selection bridge: read a selected screen frame plus the
// hand-drawn sketch shapes inside it, so a "generate from sketch" action can
// pass them to the layout formatter (packages/prototype/sketch-layout).
// Kept pure (`canvasSketchSelection`) so it unit-tests without a live tldraw
// editor -- the hook is a thin `useValue` wrapper that recomputes it whenever
// the editor's selection or shapes change.

export type EditorShape = {
  id: string;
  type: string;
  meta: Record<string, unknown>;
  props?: Record<string, unknown>;
};

export type Bounds = { x: number; y: number; w: number; h: number };

// The minimal slice of tldraw's Editor that the pure selection logic needs,
// so tests can pass a plain object instead of a real editor.
export type SelectionEditor = {
  getSelectedShapes(): EditorShape[];
  getCurrentPageShapes(): EditorShape[];
  getShapePageBounds(id: string): Bounds | null;
};

export type CanvasScreenSelection = {
  // The existing screen this entry targets, or `null` for "create a new screen
  // from this sketch" -- a selection of loose drawn shapes that sit on blank
  // canvas, inside no screen frame. `frame` is then the shapes' own bounding
  // box (so serializeSketch still yields a relative layout), not a real frame.
  targetScreenId: string | null;
  frame: Bounds;
  sketchShapes: SketchShape[];
};

// Maps a stock tldraw shape type (+ its props) to the coarse SketchShape kind
// the layout formatter understands. Unknown/unsupported types fall back to
// "other" rather than being excluded, so the caller decides what to do with
// them.
function tldrawTypeToSketchKind(
  type: string,
  props: Record<string, unknown> | undefined,
): SketchShape["kind"] {
  if (type === "geo") return props?.geo === "ellipse" ? "ellipse" : "rectangle";
  if (type === "text") return "text";
  if (type === "draw" || type === "line") return "line";
  return "other";
}

// tldraw stores shape text as a TipTap-style rich-text doc
// (`{ type: "doc", content: [...] }`) under `props.richText`. Walk it for
// plain text without needing a live editor (`renderPlaintextFromRichText`
// requires one), joining block-level nodes (paragraphs) with newlines.
function plaintextFromRichTextNode(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const { type, text, content } = node as {
    type?: unknown;
    text?: unknown;
    content?: unknown;
  };
  if (type === "text" && typeof text === "string") return text;
  if (Array.isArray(content)) {
    return content.map(plaintextFromRichTextNode).join(type === "doc" ? "\n" : "");
  }
  return "";
}

function shapeText(shape: EditorShape): string | null {
  const richText = shape.props?.richText;
  if (richText) {
    const text = plaintextFromRichTextNode(richText).trim();
    if (text) return text;
    return null;
  }
  const plain = shape.props?.text;
  if (typeof plain === "string" && plain.trim()) return plain.trim();
  return null;
}

function isScreenFrame(shape: EditorShape): boolean {
  return typeof shape.meta.meldScreenId === "string";
}

function isFlowShape(shape: EditorShape): boolean {
  return shape.meta.meld != null;
}

function toSketchShape(shape: EditorShape, bounds: Bounds): SketchShape {
  return {
    kind: tldrawTypeToSketchKind(shape.type, shape.props),
    x: bounds.x,
    y: bounds.y,
    w: bounds.w,
    h: bounds.h,
    text: shapeText(shape),
  };
}

// The smallest box containing all the given bounds -- used as the synthetic
// "frame" for a new-screen-from-sketch entry, so serializeSketch can express
// each drawn shape's position/size relative to the drawing's own extent.
function boundingBoxOf(all: Bounds[]): Bounds {
  const minX = Math.min(...all.map((b) => b.x));
  const minY = Math.min(...all.map((b) => b.y));
  const maxX = Math.max(...all.map((b) => b.x + b.w));
  const maxY = Math.max(...all.map((b) => b.y + b.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// Pure: given a minimal editor-shaped interface, return one entry per screen
// the user has targeted -- a screen is targeted when its frame is selected OR
// when a loose (non-frame, non-flow) shape whose center sits inside that frame
// is selected. Each entry carries the sketch shapes contained in that frame.
// Selected loose shapes that sit inside NO frame are grouped into a single
// extra `targetScreenId: null` entry ("create a new screen from this sketch"),
// whose frame is the shapes' own bounding box.
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
  const looseOutside: { shape: EditorShape; bounds: Bounds }[] = [];
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
    else looseOutside.push({ shape, bounds });
  }

  const targets = allFrames
    .filter((f) => targetFrameIds.has(f.id))
    .sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y);

  const entries: CanvasScreenSelection[] = targets.map((target) => {
    const sketchShapes: SketchShape[] = [];
    for (const shape of editor.getCurrentPageShapes()) {
      if (shape.id === target.id) continue;
      if (isScreenFrame(shape) || isFlowShape(shape)) continue;
      const bounds = editor.getShapePageBounds(shape.id);
      if (!bounds) continue;
      if (!shapeCenterInFrame(bounds, target.bounds)) continue;
      sketchShapes.push(toSketchShape(shape, bounds));
    }
    return { targetScreenId: target.screenId, frame: target.bounds, sketchShapes };
  });

  // Loose shapes drawn on blank canvas (inside no frame), selected together,
  // become one "new screen from this sketch" entry.
  if (looseOutside.length > 0) {
    entries.push({
      targetScreenId: null,
      frame: boundingBoxOf(looseOutside.map((l) => l.bounds)),
      sketchShapes: looseOutside.map((l) => toSketchShape(l.shape, l.bounds)),
    });
  }

  return entries;
}

// Thin reactive wrapper: recomputes `canvasSketchSelection` whenever the
// editor's selection or shapes change. All real logic lives in the pure
// function above so it can be unit-tested without a live editor.
//
// `editorReady` (the caller's own "an editor has mounted" state, e.g.
// `isEditorReady` in user-flow-trial-canvas.tsx, flipped `true` in the same
// `onMount` callback that sets `editorRef.current`) is required as an
// explicit, reactive dependency rather than reading `editorRef.current`
// directly here: `useValue`'s deps array only controls when its internal
// `computed` is *recreated* (via useMemo) -- reactivity to store changes
// afterwards comes from which signals the tracked function reads on each
// run. `editorRef` is a plain ref, never itself an atom, and reading
// `ref.current` during render is itself disallowed (react-hooks/refs), so a
// deps array of `[editorRef]` alone can never change: the very first
// evaluation runs before an editor has mounted, returns null having read no
// store atoms at all, and that computed is then permanently inert -- no
// future shape or selection change ever re-runs it, because nothing it
// depends on can become stale. Including `editorReady` in the deps array
// forces a fresh `computed` -- one that actually reads the editor's reactive
// getters -- to be created on the render after mount. A mocked editor
// supplied synchronously (as the unit tests do) never hits this gap, which
// is why it only surfaces against a live tldraw editor.
export function useCanvasSketchSelection(
  editorRef: RefObject<Editor | null>,
  editorReady: boolean,
): CanvasScreenSelection[] {
  return useValue(
    "canvas-sketch-selection",
    () => {
      const editor = editorRef.current;
      if (!editor) return [];
      // tldraw's real shape prop types are per-shape unions, not an index
      // signature, so they don't structurally satisfy `EditorShape`'s
      // `Record<string, unknown>`. The values are compatible at runtime --
      // we only ever read them, never construct a `TLShape`.
      const selectionEditor = editor as unknown as SelectionEditor;
      // Guarded the same way `extractFlowFromEditor` guards
      // `getCurrentPageShapes` -- a partially torn-down editor (or a test
      // stub that only implements the methods its own scenario needs) should
      // yield "no selection" rather than throwing.
      if (typeof selectionEditor.getSelectedShapes !== "function") return [];
      return canvasSketchSelection(selectionEditor);
    },
    [editorRef, editorReady],
  );
}
