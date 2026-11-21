export type StrokeStyle = "solid" | "dashed" | "dotted";
export type ShapeStyle = { fill: string | null; stroke: string; strokeWidth: number; strokeStyle: StrokeStyle; rounded: boolean; opacity: number };

export const MIN_STROKE_WIDTH = 1;
export const MAX_STROKE_WIDTH = 8;
export const MIN_TEXT_SIZE = 8;
export const MAX_TEXT_SIZE = 200;
// Excalidraw's "adaptive radius" roundness, the one its own Rounded button sets.
const ROUNDED = { type: 3 } as const;

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function readShapeStyle(element: { backgroundColor: string; strokeColor: string; strokeWidth: number; strokeStyle: string; roundness: unknown; opacity: number }): ShapeStyle {
  return {
    fill: element.backgroundColor === "transparent" ? null : element.backgroundColor,
    stroke: element.strokeColor,
    strokeWidth: element.strokeWidth,
    strokeStyle: element.strokeStyle === "dashed" || element.strokeStyle === "dotted" ? element.strokeStyle : "solid",
    rounded: element.roundness != null,
    opacity: element.opacity,
  };
}

// Excalidraw element props for a panel change. A fill only shows when the fill style is solid.
export function shapePatch(change: Partial<ShapeStyle>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (change.fill !== undefined) {
    patch.backgroundColor = change.fill ?? "transparent";
    if (change.fill !== null) patch.fillStyle = "solid";
  }
  if (change.stroke !== undefined) patch.strokeColor = change.stroke;
  if (change.strokeWidth !== undefined) patch.strokeWidth = clamp(change.strokeWidth, MIN_STROKE_WIDTH, MAX_STROKE_WIDTH);
  if (change.strokeStyle !== undefined) patch.strokeStyle = change.strokeStyle;
  if (change.rounded !== undefined) patch.roundness = change.rounded ? { ...ROUNDED } : null;
  if (change.opacity !== undefined) patch.opacity = clamp(change.opacity, 0, 100);
  return patch;
}
