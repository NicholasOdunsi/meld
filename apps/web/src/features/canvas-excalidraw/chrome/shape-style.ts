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

export type Controls = { panel: boolean; fill: boolean; stroke: boolean; thickness: boolean; style: boolean; corners: boolean; opacity: boolean };
const NONE: Controls = { panel: false, fill: false, stroke: false, thickness: false, style: false, corners: false, opacity: false };
const LINE_LIKE: Controls = { panel: true, fill: false, stroke: true, thickness: true, style: true, corners: false, opacity: true };

// Which panel controls do something for an Excalidraw element type. Frames, screens and images get no panel.
export function applicableControls(type: string): Controls {
  switch (type) {
    case "rectangle": return { ...LINE_LIKE, fill: true, corners: true };
    case "ellipse":
    case "diamond":
    case "freedraw": return { ...LINE_LIKE, fill: true };
    case "line":
    case "arrow": return LINE_LIKE;
    case "text": return { ...NONE, panel: true, stroke: true, opacity: true };
    default: return NONE;
  }
}

// The part of a panel patch this element type can take (a mixed selection gets a different patch per element).
export function patchFor(type: string, patch: Record<string, unknown>): Record<string, unknown> {
  const controls = applicableControls(type);
  const keep: Record<string, keyof Controls> = {
    backgroundColor: "fill", fillStyle: "fill", strokeColor: "stroke", strokeWidth: "thickness",
    strokeStyle: "style", roundness: "corners", opacity: "opacity",
  };
  return Object.fromEntries(Object.entries(patch).filter(([key]) => controls[keep[key]]));
}
