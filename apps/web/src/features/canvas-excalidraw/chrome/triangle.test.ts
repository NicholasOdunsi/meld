import { describe, expect, it } from "vitest";
import { sceneToContainer } from "./selection";
import { triangleAt, TRIANGLE_SIZE } from "./triangle";

const view = { scrollX: 100, scrollY: -50, zoom: 2, width: 1000, height: 800 };

describe("triangleAt", () => {
  it("draws a closed three-corner outline that returns to its start", () => {
    const { points } = triangleAt(view);
    expect(points).toHaveLength(4);
    expect(points[0]).toEqual([0, TRIANGLE_SIZE]);
    expect(points[3]).toEqual(points[0]);
    // apex is above the base, centred
    expect(points[1]).toEqual([TRIANGLE_SIZE / 2, 0]);
    expect(points[2]).toEqual([TRIANGLE_SIZE, TRIANGLE_SIZE]);
  });
  it("lands in the middle of what you can see", () => {
    const { x, y } = triangleAt(view);
    expect(sceneToContainer({ x: x + TRIANGLE_SIZE / 2, y: y + TRIANGLE_SIZE / 2 }, view)).toEqual({ x: 500, y: 400 });
  });
});
