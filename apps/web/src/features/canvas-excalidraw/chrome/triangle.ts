import type { Viewport } from "./zoom";

export const TRIANGLE_SIZE = 160; // board units

// Excalidraw has no triangle tool, but a line that returns to its first point
// is a closed shape you can fill, move and resize like any other.
// Excalidraw maps scene -> viewport as (scene + scroll) * zoom, so the scene
// point under the viewport centre is centre / zoom - scroll.
export function triangleAt(view: Viewport): { x: number; y: number; points: [number, number][] } {
  const size = TRIANGLE_SIZE;
  return {
    x: view.width / 2 / view.zoom - view.scrollX - size / 2,
    y: view.height / 2 / view.zoom - view.scrollY - size / 2,
    points: [[0, size], [size / 2, 0], [size, size], [0, size]],
  };
}
