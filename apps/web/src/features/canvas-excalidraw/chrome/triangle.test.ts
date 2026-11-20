import { describe, expect, it } from "vitest";
import { MIN_DRAG, trianglePlacedAt, triangleFromDrag } from "./triangle";

describe("triangleFromDrag", () => {
  it("fits a triangle inside the dragged box, apex at the top centre", () => {
    const t = triangleFromDrag({ x: 100, y: 50 }, { x: 300, y: 250 });
    // x, y is the bottom-left corner; points are measured from it (up is negative).
    expect(t).toEqual({ x: 100, y: 250, width: 200, height: 200, points: [[0, 0], [100, -200], [200, 0], [0, 0]] });
  });
  it("is normalized: the first point is the origin, and the outline returns to it", () => {
    const { points } = triangleFromDrag({ x: 0, y: 0 }, { x: 80, y: 40 });
    expect(points[0]).toEqual([0, 0]);
    expect(points[3]).toEqual(points[0]);
  });
  it("gives the same triangle whichever corner you start dragging from", () => {
    const a = triangleFromDrag({ x: 100, y: 50 }, { x: 300, y: 250 });
    for (const [from, to] of [
      [{ x: 300, y: 250 }, { x: 100, y: 50 }],
      [{ x: 300, y: 50 }, { x: 100, y: 250 }],
      [{ x: 100, y: 250 }, { x: 300, y: 50 }],
    ] as const) expect(triangleFromDrag(from, to)).toEqual(a);
  });
  it("sizes the element to the outline it draws", () => {
    const t = triangleFromDrag({ x: 10, y: 10 }, { x: 70, y: 130 });
    const xs = t.points.map((p) => p[0]);
    const ys = t.points.map((p) => p[1]);
    expect({ width: t.width, height: t.height }).toEqual({ width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) });
  });
});

describe("trianglePlacedAt", () => {
  it("centres a default-size triangle on a plain click", () => {
    const t = trianglePlacedAt({ x: 500, y: 400 });
    expect(t.width).toBe(t.height);
    expect(t.x + t.width / 2).toBe(500);
    expect(t.y - t.height / 2).toBe(400);
  });
  it("treats a tiny drag as a click", () => {
    expect(MIN_DRAG).toBeGreaterThan(0);
  });
});
