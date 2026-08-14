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

export type CanvasSketchSelection = {
  targetScreenId: string;
  sketchShapes: SketchShape[];
  frame: Bounds;
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

// Pure: given a minimal editor-shaped interface, return the selected screen
// frame's id plus the sketch shapes it contains, or null when the selection
// isn't exactly one screen frame.
export function canvasSketchSelection(
  editor: SelectionEditor,
): CanvasSketchSelection | null {
  const selected = editor.getSelectedShapes();
  const screenFrames = selected.filter(isScreenFrame);
  if (screenFrames.length !== 1) return null;

  const frameShape = screenFrames[0]!;
  const targetScreenId = frameShape.meta.meldScreenId as string;
  const frame = editor.getShapePageBounds(frameShape.id);
  if (!frame) return null;

  const sketchShapes: SketchShape[] = [];
  for (const shape of editor.getCurrentPageShapes()) {
    if (shape.id === frameShape.id) continue;
    if (isScreenFrame(shape) || isFlowShape(shape)) continue;
    const bounds = editor.getShapePageBounds(shape.id);
    if (!bounds) continue;
    if (!shapeCenterInFrame(bounds, frame)) continue;
    sketchShapes.push({
      kind: tldrawTypeToSketchKind(shape.type, shape.props),
      x: bounds.x,
      y: bounds.y,
      w: bounds.w,
      h: bounds.h,
      text: shapeText(shape),
    });
  }

  return { targetScreenId, sketchShapes, frame };
}

// Thin reactive wrapper: recomputes `canvasSketchSelection` whenever the
// editor's selection or shapes change. All real logic lives in the pure
// function above so it can be unit-tested without a live editor.
export function useCanvasSketchSelection(
  editorRef: RefObject<Editor | null>,
): CanvasSketchSelection | null {
  return useValue(
    "canvas-sketch-selection",
    () => {
      const editor = editorRef.current;
      // tldraw's real shape prop types are per-shape unions, not an index
      // signature, so they don't structurally satisfy `EditorShape`'s
      // `Record<string, unknown>`. The values are compatible at runtime --
      // we only ever read them, never construct a `TLShape`.
      return editor
        ? canvasSketchSelection(editor as unknown as SelectionEditor)
        : null;
    },
    [editorRef],
  );
}
