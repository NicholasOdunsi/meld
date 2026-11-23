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

export function stepZoom(zoom: number, direction: 1 | -1): number {
  return Math.round((direction === 1 ? zoom * 1.25 : zoom / 1.25) * 1000) / 1000;
}
