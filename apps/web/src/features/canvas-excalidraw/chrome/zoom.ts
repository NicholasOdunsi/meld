export type Viewport = { scrollX: number; scrollY: number; zoom: number; width: number; height: number };

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 30;

// Excalidraw maps scene -> viewport as (scene + scroll) * zoom, so keeping the
// scene point under the viewport centre fixed means adjusting scroll by the
// difference in half-viewport extents at the two zoom levels.
export function zoomAroundCenter(view: Viewport, nextZoom: number) {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
  const halfWidth = view.width / 2;
  const halfHeight = view.height / 2;
  return {
    zoom,
    scrollX: view.scrollX + halfWidth * (1 / zoom - 1 / view.zoom),
    scrollY: view.scrollY + halfHeight * (1 / zoom - 1 / view.zoom),
  };
}

export function stepZoom(zoom: number, direction: 1 | -1): number {
  return Math.round((direction === 1 ? zoom * 1.25 : zoom / 1.25) * 1000) / 1000;
}
