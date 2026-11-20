import type { CSSProperties } from "react";
import type { Viewport } from "./zoom";

const SPACING = 24; // board units between dots
const MIN_ON_SCREEN = 14; // px; below this, skip every other dot

// Dots sit on a fixed grid in the board's own coordinates, so they move and
// scale with every pan and zoom. Excalidraw maps scene -> viewport as
// (scene + scroll) * zoom. Zoomed far out, spacing doubles so dots stay on the
// grid but never crowd into a haze.
export function dotGridStyle(view: Viewport): CSSProperties {
  let step = SPACING * view.zoom;
  while (step < MIN_ON_SCREEN) step *= 2;
  // The dot is drawn at the middle of each tile, so shift the tile back by half.
  const x = view.scrollX * view.zoom - step / 2;
  const y = view.scrollY * view.zoom - step / 2;
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    backgroundImage: "radial-gradient(circle at center, color-mix(in srgb, var(--color-text-primary) 22%, transparent) 1px, transparent 1.5px)",
    backgroundSize: `${round(step)}px ${round(step)}px`,
    backgroundPosition: `${round(x)}px ${round(y)}px`,
  };
}
