import { z } from "zod";

export const MAX_SKETCH_BOXES = 60;
export const MAX_TEXT = 200;

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
          text: z.string().max(MAX_TEXT).nullable(),
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
function widthBucket(f: number): "narrow" | "medium" | "wide" | "full" {
  return f < 0.33 ? "narrow" : f < 0.66 ? "medium" : f < 0.95 ? "wide" : "full";
}
function heightBucket(f: number): "short" | "medium" | "tall" {
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
