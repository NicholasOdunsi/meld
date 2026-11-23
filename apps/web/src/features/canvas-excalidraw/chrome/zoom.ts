export type Viewport = { scrollX: number; scrollY: number; zoom: number; width: number; height: number };
export type Point = { x: number; y: number };
type Bounds = { x: number; y: number; width: number; height: number };

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 30;
const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

// Excalidraw maps scene -> viewport as (scene + scroll) * zoom, so keeping the
// scene point under a viewport point fixed means adjusting scroll by that
// point's offset at the two zoom levels. The point is the anchor when given
// (in board px), else the centre of the visible board.
export function zoomAroundCenter(view: Viewport, nextZoom: number, anchor?: Point) {
  const zoom = clampZoom(nextZoom);
  const x = anchor ? anchor.x : view.width / 2;
  const y = anchor ? anchor.y : view.height / 2;
  return {
    zoom,
    scrollX: view.scrollX + x * (1 / zoom - 1 / view.zoom),
    scrollY: view.scrollY + y * (1 / zoom - 1 / view.zoom),
  };
}

// The centre of the first frame given (the selected screen, then the awake one), in board px,
// or none when there is no frame or its centre is off the visible board.
export function zoomAnchor(frames: readonly (Bounds | null | undefined)[], view: Viewport): Point | undefined {
  const frame = frames.find((candidate) => candidate);
  if (!frame) return undefined;
  const x = (frame.x + frame.width / 2 + view.scrollX) * view.zoom;
  const y = (frame.y + frame.height / 2 + view.scrollY) * view.zoom;
  return x >= 0 && x <= view.width && y >= 0 && y <= view.height ? { x, y } : undefined;
}

// Excalidraw 0.18's ctrl+wheel step (App.handleWheel), so a pinch over a live screen zooms
// exactly as it does over empty board.
const WHEEL_MAX_STEP = 10;
export function wheelZoom(zoom: number, deltaY: number): number {
  const sign = Math.sign(deltaY);
  const absDelta = Math.abs(deltaY);
  const delta = absDelta > WHEEL_MAX_STEP ? WHEEL_MAX_STEP * sign : deltaY;
  const next = zoom - delta / 100 + Math.log10(Math.max(1, zoom)) * -sign * Math.min(1, absDelta / 20);
  return clampZoom(Math.round(next * 1e6) / 1e6);
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

// The live iframe on the page: its drawn rect and its own (unscaled) layout size.
export type FrameBox = { left: number; top: number; width: number; height: number; offsetWidth: number; offsetHeight: number };
export type BoardState = Viewport & { offsetLeft: number; offsetTop: number };

// Where a pinch the live frame reported (in its own px) lands on the board, in board px. The frame
// is untrusted, so its point is clamped onto its own box first; if that is off the visible board,
// the frame's centre is used, and with that off too, no anchor (the visible board's centre).
export function frameZoomAnchor(point: Point, box: FrameBox, board: BoardState): Point | undefined {
  const scale = box.offsetWidth ? box.width / box.offsetWidth : board.zoom;
  const width = box.offsetWidth || box.width / board.zoom;
  const height = box.offsetHeight || box.height / board.zoom;
  const toBoard = (x: number, y: number) => ({ x: box.left + x * scale - board.offsetLeft, y: box.top + y * scale - board.offsetTop });
  const visible = (at: Point) => at.x >= 0 && at.x <= board.width && at.y >= 0 && at.y <= board.height;
  const at = toBoard(clamp(point.x, 0, width), clamp(point.y, 0, height));
  if (visible(at)) return at;
  const centre = toBoard(width / 2, height / 2);
  return visible(centre) ? centre : undefined;
}

// One frame's worth of reported zoom: the summed wheel delta (Excalidraw's step), then the pinch ratio.
export type FrameZoomStep = { point: Point; deltaY: number; scale: number };
export function frameZoomTarget(zoom: number, step: Pick<FrameZoomStep, "deltaY" | "scale">): number {
  return clampZoom(wheelZoom(zoom, step.deltaY) * step.scale);
}

// Per-frame bounds on what the live frame may ask for, however many messages it sends.
const FRAME_WHEEL_LIMIT = 1000;
const FRAME_SCALE_MIN = 0.5;
const FRAME_SCALE_MAX = 2;
// Collects the live frame's zoom messages and applies them at most once per scheduled frame.
export function createFrameZoomBatch(
  schedule: (run: () => void) => void,
  apply: (step: FrameZoomStep) => void,
) {
  let pending: FrameZoomStep | null = null;
  return {
    push(zoom: { x: number; y: number; deltaY: number } | { x: number; y: number; scale: number }) {
      const first = pending === null;
      const step: FrameZoomStep = pending ?? { point: { x: 0, y: 0 }, deltaY: 0, scale: 1 };
      step.point = { x: zoom.x, y: zoom.y };
      if ("deltaY" in zoom) step.deltaY = clamp(step.deltaY + zoom.deltaY, -FRAME_WHEEL_LIMIT, FRAME_WHEEL_LIMIT);
      else step.scale = clamp(step.scale * zoom.scale, FRAME_SCALE_MIN, FRAME_SCALE_MAX);
      pending = step;
      if (first) schedule(() => {
        const ready = pending;
        pending = null;
        if (ready) apply(ready);
      });
    },
    cancel() { pending = null; },
  };
}

export function stepZoom(zoom: number, direction: 1 | -1): number {
  return Math.round((direction === 1 ? zoom * 1.25 : zoom / 1.25) * 1000) / 1000;
}
