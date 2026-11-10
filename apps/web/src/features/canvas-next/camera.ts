import type { Point } from "./document";
export type Camera = { x: number; y: number; zoom: number };
function check(point: Point, camera: Camera) {
  if (![point.x, point.y, camera.x, camera.y, camera.zoom].every(Number.isFinite) || camera.zoom <= 0) {
    throw new Error("Invalid canvas coordinates");
  }
}
export function toScreen(point: Point, camera: Camera): Point {
  check(point, camera);
  return { x: point.x * camera.zoom + camera.x, y: point.y * camera.zoom + camera.y };
}
export function toWorld(point: Point, camera: Camera): Point {
  check(point, camera);
  return { x: (point.x - camera.x) / camera.zoom, y: (point.y - camera.y) / camera.zoom };
}
export function zoomAt(camera: Camera, anchor: Point, requestedZoom: number): Camera {
  if (!Number.isFinite(requestedZoom)) throw new Error("Invalid zoom");
  const world = toWorld(anchor, camera), zoom = Math.max(0.1, Math.min(8, requestedZoom));
  return { zoom, x: anchor.x - world.x * zoom, y: anchor.y - world.y * zoom };
}
