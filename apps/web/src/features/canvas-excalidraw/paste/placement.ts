import type { Viewport } from "../chrome/zoom";

// Excalidraw maps scene -> viewport as (scene + scroll) * zoom, so the scene
// point under the viewport centre is centre / zoom - scroll.
export function centredPosition(view: Viewport, size: { w: number; h: number }): { x: number; y: number } {
  return {
    x: view.width / 2 / view.zoom - view.scrollX - size.w / 2,
    y: view.height / 2 / view.zoom - view.scrollY - size.h / 2,
  };
}
