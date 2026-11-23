// Excalidraw has no triangle tool, but a line that returns to its first point
// is a closed shape you can fill, move and resize like any other.
//
// A line must be "normalized": its first point is [0, 0] and the element sits
// at that point. So x, y is the bottom-left corner and the other points are
// measured from it (up is negative). width and height must match the outline.
export type Point = { x: number; y: number };
export type TriangleGeometry = { x: number; y: number; width: number; height: number; points: [number, number][] };

export const DEFAULT_TRIANGLE_SIZE = 120; // board units, for a plain click
export const MIN_DRAG = 6; // screen px; a shorter drag counts as a click

// The triangle that fills the box between two corners, whichever way you drag.
export function triangleFromDrag(a: Point, b: Point): TriangleGeometry {
  const left = Math.min(a.x, b.x);
  const right = Math.max(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const bottom = Math.max(a.y, b.y);
  const width = right - left;
  const height = bottom - top;
  return { x: left, y: bottom, width, height, points: [[0, 0], [width / 2, -height], [width, 0], [0, 0]] };
}

// A plain click: a default-size triangle centred on the click.
export function trianglePlacedAt(centre: Point): TriangleGeometry {
  const half = DEFAULT_TRIANGLE_SIZE / 2;
  return triangleFromDrag({ x: centre.x - half, y: centre.y - half }, { x: centre.x + half, y: centre.y + half });
}

// Excalidraw leaves plain Y free (it only uses Cmd/Ctrl+Y, for redo).
export const TRIANGLE_SHORTCUT = "Y";

export function isTriangleShortcut(press: {
  key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; targetIsEditable: boolean;
}): boolean {
  return press.key.toUpperCase() === TRIANGLE_SHORTCUT && !press.ctrlKey && !press.metaKey && !press.altKey && !press.shiftKey && !press.targetIsEditable;
}
