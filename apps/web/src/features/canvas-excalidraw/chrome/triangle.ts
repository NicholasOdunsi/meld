import type { Viewport } from "./zoom";

export const TRIANGLE_SIZE = 160; // board units

// Excalidraw has no triangle tool, but a line that returns to its first point
// is a closed shape you can fill, move and resize like any other.
//
// A line must be "normalized": its first point is [0, 0] and the element sits
// at that point. So x, y is the bottom-left corner and the other points are
// measured from it (up is negative).
//
// Excalidraw maps scene -> viewport as (scene + scroll) * zoom, so the scene
// point under the viewport centre is centre / zoom - scroll.
export function triangleAt(view: Viewport): { x: number; y: number; width: number; height: number; points: [number, number][] } {
  const size = TRIANGLE_SIZE;
  return {
    x: view.width / 2 / view.zoom - view.scrollX - size / 2,
    y: view.height / 2 / view.zoom - view.scrollY + size / 2,
    width: size,
    height: size,
    points: [[0, 0], [size / 2, -size], [size, 0], [0, 0]],
  };
}
