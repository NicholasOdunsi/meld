import type { CanvasDocument, CanvasObject, Point } from "./document";
export type Tool = "select" | "pan" | "draw" | "rectangle" | "text";
export type Bounds = { x: number; y: number; width: number; height: number };
export function boundsBetween(a: Point, b: Point): Bounds {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.max(1, Math.abs(b.x-a.x)), height: Math.max(1, Math.abs(b.y-a.y)) };
}
export function strokeFromPoints(id: string, points: Point[]): Extract<CanvasObject, {kind: "stroke"}> {
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const bounds = boundsBetween({x: Math.min(...xs), y: Math.min(...ys)}, {x: Math.max(...xs), y: Math.max(...ys)});
  return { id, kind: "stroke", ...bounds, points: points.map(p => ({x: p.x - bounds.x, y: p.y - bounds.y})) };
}
function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x-a.x, dy = b.y-a.y;
  const t = Math.max(0, Math.min(1, ((p.x-a.x)*dx + (p.y-a.y)*dy) / (dx*dx+dy*dy || 1)));
  return Math.hypot(p.x-a.x-t*dx, p.y-a.y-t*dy);
}
export function hitTest(doc: CanvasDocument, world: Point, tolerance: number): string | null {
  for (let i = doc.objects.length-1; i >= 0; i--) {
    const object = doc.objects[i];
    if (world.x < object.x-tolerance || world.y < object.y-tolerance || world.x > object.x+object.width+tolerance || world.y > object.y+object.height+tolerance) continue;
    if (object.kind !== "stroke") return object.id;
    const p = {x: world.x-object.x, y: world.y-object.y};
    if (object.points.length === 1 && segmentDistance(p, object.points[0], object.points[0]) <= tolerance) return object.id;
    for (let j = 1; j < object.points.length; j++) {
      if (segmentDistance(p, object.points[j-1], object.points[j]) <= tolerance) return object.id;
    }
  }
  return null;
}
export function translateObjects(doc: CanvasDocument, ids: string[], delta: Point): CanvasDocument {
  return {...doc, objects: doc.objects.map(object => ids.includes(object.id) ? {...object, x: object.x+delta.x, y: object.y+delta.y} : object)};
}
export function resizeObject(doc: CanvasDocument, id: string, bounds: Bounds): CanvasDocument {
  return {...doc, objects: doc.objects.map(object => {
    if (object.id !== id) return object;
    const width = Math.max(1, bounds.width), height = Math.max(1, bounds.height);
    return {...object, ...bounds, width, height, ...(object.kind === "stroke" ? {
      points: object.points.map(p => ({x: p.x*width/object.width, y: p.y*height/object.height})),
    } : {})};
  })};
}
