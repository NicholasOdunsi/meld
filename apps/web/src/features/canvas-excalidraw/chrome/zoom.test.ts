import { describe, expect, it } from "vitest";
import { stepZoom, wheelZoom, zoomAnchor, zoomAroundCenter } from "./zoom";

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

describe("zoomAroundCenter with an anchor", () => {
  const view = { scrollX: 40, scrollY: -10, zoom: 1, width: 1144, height: 1000 };
  const sceneUnder = (point: { x: number; y: number }, at: { scrollX: number; scrollY: number; zoom: number }) =>
    ({ x: point.x / at.zoom - at.scrollX, y: point.y / at.zoom - at.scrollY });
  it("keeps the scene point under the anchor fixed, zooming in and out", () => {
    const anchor = { x: 300, y: 220 };
    for (const nextZoom of [stepZoom(1, 1), stepZoom(1, -1), 2.7, 0.35]) {
      const before = sceneUnder(anchor, view);
      const next = zoomAroundCenter(view, nextZoom, anchor);
      expect(next.zoom).toBe(nextZoom);
      expect(toViewport(before.x, next.scrollX, next.zoom)).toBeCloseTo(anchor.x);
      expect(toViewport(before.y, next.scrollY, next.zoom)).toBeCloseTo(anchor.y);
    }
  });
  it("still clamps at the minimum and maximum, keeping the anchor fixed", () => {
    const anchor = { x: 900, y: 40 };
    const before = sceneUnder(anchor, view);
    for (const [asked, clamped] of [[100, 30], [0.01, 0.1]] as const) {
      const next = zoomAroundCenter(view, asked, anchor);
      expect(next.zoom).toBe(clamped);
      expect(toViewport(before.x, next.scrollX, next.zoom)).toBeCloseTo(anchor.x);
      expect(toViewport(before.y, next.scrollY, next.zoom)).toBeCloseTo(anchor.y);
    }
  });
  it("falls back to the centre of the visible board without an anchor", () => {
    expect(zoomAroundCenter(view, 2, undefined)).toEqual(zoomAroundCenter(view, 2, { x: 572, y: 500 }));
  });
});

describe("zoomAnchor", () => {
  const view = { scrollX: 0, scrollY: 0, zoom: 0.5, width: 1144, height: 1000 };
  const frame = (x: number, y: number) => ({ x, y, width: 400, height: 300 });
  it("uses the centre of the first frame given (the selected screen before the awake one)", () => {
    expect(zoomAnchor([frame(200, 100), frame(1000, 1000)], view)).toEqual({ x: 200, y: 125 });
    expect(zoomAnchor([null, frame(1000, 1000)], view)).toEqual({ x: 600, y: 575 });
  });
  it("gives no anchor with no frame, or when that frame's centre is off the visible board", () => {
    expect(zoomAnchor([null, undefined], view)).toBeUndefined();
    expect(zoomAnchor([frame(2400, 0), frame(0, 0)], view)).toBeUndefined();
    expect(zoomAnchor([frame(-600, 0)], view)).toBeUndefined();
  });
});

describe("wheelZoom", () => {
  // Excalidraw 0.18's own ctrl+wheel step (App.handleWheel), so the board zooms the same over a live screen.
  it("matches Excalidraw's ctrl+wheel zoom step", () => {
    expect(wheelZoom(1, -100)).toBeCloseTo(1.1);
    expect(wheelZoom(1, 100)).toBeCloseTo(0.9);
    expect(wheelZoom(1, -4)).toBeCloseTo(1.04);
    expect(wheelZoom(2, -100)).toBeCloseTo(2 + 0.1 + Math.log10(2));
    expect(wheelZoom(2, 5)).toBeCloseTo(2 - 0.05 - Math.log10(2) * 0.25);
  });
  it("clamps to the board's zoom range", () => {
    expect(wheelZoom(0.1, 100)).toBe(0.1);
    expect(wheelZoom(30, -100)).toBe(30);
  });
});

describe("stepZoom", () => {
  it("steps by 25%", () => {
    expect(stepZoom(1, 1)).toBe(1.25);
    expect(stepZoom(1.25, -1)).toBe(1);
  });
});
