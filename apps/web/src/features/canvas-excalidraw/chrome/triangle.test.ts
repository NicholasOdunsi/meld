import { describe, expect, it } from "vitest";
import { sceneToContainer } from "./selection";
import { triangleAt, TRIANGLE_SIZE } from "./triangle";

const view = { scrollX: 100, scrollY: -50, zoom: 2, width: 1000, height: 800 };

describe("triangleAt", () => {
  it("is normalized: the first point is the origin of the line", () => {
    // Excalidraw rejects a line whose first point isn't [0, 0].
    expect(triangleAt(view).points[0]).toEqual([0, 0]);
  });
  it("draws a closed three-corner outline that returns to its start", () => {
    const { points } = triangleAt(view);
    expect(points).toHaveLength(4);
    expect(points[3]).toEqual(points[0]);
    // starts at the bottom-left; the apex is above the base, centred
    expect(points[1]).toEqual([TRIANGLE_SIZE / 2, -TRIANGLE_SIZE]);
    expect(points[2]).toEqual([TRIANGLE_SIZE, 0]);
  });
  it("lands in the middle of what you can see", () => {
    const { x, y } = triangleAt(view);
    // x, y is the bottom-left corner, so the shape's centre is half a side up and across.
    expect(sceneToContainer({ x: x + TRIANGLE_SIZE / 2, y: y - TRIANGLE_SIZE / 2 }, view)).toEqual({ x: 500, y: 400 });
  });
});
