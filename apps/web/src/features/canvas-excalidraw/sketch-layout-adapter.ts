import { serializeSketch, type SketchLayout } from "@meld/prototype";
import type { SketchRequest } from "./sketch-request";

// The sketch region's shapes, in the form the existing screen generator takes.
export function toSketchLayout(request: Pick<SketchRequest, "width" | "height" | "geometry">): SketchLayout {
  return serializeSketch(
    request.geometry.map((shape) => ({
      kind: shape.type,
      x: shape.x,
      y: shape.y,
      w: shape.width,
      h: shape.height,
      text: shape.text ?? null,
    })),
    { x: 0, y: 0, w: request.width, h: request.height },
  );
}
