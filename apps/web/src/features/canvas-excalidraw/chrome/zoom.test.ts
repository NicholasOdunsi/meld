import { describe, expect, it } from "vitest";
import { stepZoom, zoomAroundCenter } from "./zoom";

// Excalidraw maps scene → viewport as (scene + scroll) * zoom.
const toViewport = (scene: number, scroll: number, zoom: number) => (scene + scroll) * zoom;

describe("zoomAroundCenter", () => {
  it("keeps the scene point under the viewport centre fixed", () => {
    const view = { scrollX: 40, scrollY: -10, zoom: 1, width: 800, height: 600 };
    const next = zoomAroundCenter(view, 2);
    const centreSceneX = view.width / 2 / view.zoom - view.scrollX;
    const centreSceneY = view.height / 2 / view.zoom - view.scrollY;
    expect(toViewport(centreSceneX, next.scrollX, next.zoom)).toBeCloseTo(400);
    expect(toViewport(centreSceneY, next.scrollY, next.zoom)).toBeCloseTo(300);
  });
  it("clamps the zoom", () => {
    expect(zoomAroundCenter({ scrollX: 0, scrollY: 0, zoom: 1, width: 10, height: 10 }, 100).zoom).toBe(30);
    expect(zoomAroundCenter({ scrollX: 0, scrollY: 0, zoom: 1, width: 10, height: 10 }, 0.01).zoom).toBe(0.1);
  });
});

describe("stepZoom", () => {
  it("steps by 25%", () => {
    expect(stepZoom(1, 1)).toBe(1.25);
    expect(stepZoom(1.25, -1)).toBe(1);
  });
});
