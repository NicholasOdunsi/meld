export type PillPlacement = {
  // Where the pill would sit, centred under the frame (container pixels): the middle of the frame's bottom edge.
  anchor: { x: number; y: number };
  // The frame's edges in the same pixels, to tell when it is out of view.
  frame: { left: number; top: number; right: number; bottom: number };
  pill: { w: number; h: number };
  viewport: { w: number; h: number };
  margin: number;
  // Keeps clear of the tool dock on the left, and of the zoom control at the bottom.
  leftInset: number;
  bottomInset: number;
  gap: number;
};

// The pill's centre x and top y, kept inside the visible board: centred under the frame, clamped
// sideways, and pinned above the bottom inset when the frame runs off the bottom (it then overlaps
// the frame's lower part). null when the frame is not in view at all, so nothing is drawn.
export function clampPill(p: PillPlacement): { x: number; y: number } | null {
  const { frame, viewport, pill } = p;
  if (frame.right <= 0 || frame.left >= viewport.w || frame.bottom <= 0 || frame.top >= viewport.h) return null;
  const low = p.leftInset + pill.w / 2;
  const high = viewport.w - p.margin - pill.w / 2;
  const x = high < low ? low : Math.min(Math.max(p.anchor.x, low), high);
  const y = Math.max(p.margin, Math.min(p.anchor.y + p.gap, viewport.h - p.bottomInset - pill.h));
  return { x, y };
}
