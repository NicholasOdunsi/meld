import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { createFrameZoomBatch, frameZoomAnchor, frameZoomTarget, stepZoom, wheelZoom, zoomAnchor, zoomAroundCenter } from "./zoom";

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

describe("frameZoomAnchor", () => {
  // The live iframe: 400×300 CSS px drawn at zoom 0.5, its top-left at page (300, 176); the board starts at page (0, 76).
  const box = { left: 300, top: 176, width: 200, height: 150, offsetWidth: 400, offsetHeight: 300 };
  const app = { scrollX: 0, scrollY: 0, zoom: 0.5, width: 1144, height: 924, offsetLeft: 0, offsetTop: 76 };
  it("maps the frame's own px to board px through the iframe's drawn scale", () => {
    expect(frameZoomAnchor({ x: 100, y: 60 }, box, app)).toEqual({ x: 350, y: 130 });
  });
  it("clamps a point off the frame onto its edge, so a hostile screen cannot move the anchor away", () => {
    expect(frameZoomAnchor({ x: 100_000, y: -100_000 }, box, app)).toEqual({ x: 500, y: 100 });
    expect(frameZoomAnchor({ x: -5, y: 1e9 }, box, app)).toEqual({ x: 300, y: 250 });
  });
  it("falls back to the frame centre when the clamped point is off the visible board, else to no anchor", () => {
    const partly = { ...box, left: 1000 }; // the frame's right part runs past the board's edge (1144)
    expect(frameZoomAnchor({ x: 390, y: 10 }, partly, app)).toEqual({ x: 1100, y: 175 });
    expect(frameZoomAnchor({ x: 0, y: 0 }, { ...box, left: 5000 }, app)).toBeUndefined();
  });
  it("uses the board zoom for the scale when the iframe has no layout width", () => {
    expect(frameZoomAnchor({ x: 100, y: 60 }, { ...box, offsetWidth: 0, offsetHeight: 0 }, app)).toEqual({ x: 350, y: 130 });
  });
});

describe("frameZoomTarget", () => {
  it("applies the summed wheel delta with Excalidraw's step, then the pinch ratio, clamped", () => {
    expect(frameZoomTarget(1, { deltaY: -100, scale: 1 })).toBeCloseTo(1.1);
    expect(frameZoomTarget(1, { deltaY: 0, scale: 1.5 })).toBeCloseTo(1.5);
    expect(frameZoomTarget(1, { deltaY: -100, scale: 2 })).toBeCloseTo(2.2);
    expect(frameZoomTarget(20, { deltaY: 0, scale: 2 })).toBe(30);
  });
});

describe("createFrameZoomBatch", () => {
  it("applies a burst of messages at most once per frame, summing wheels and multiplying pinches within bounds", () => {
    const frames: (() => void)[] = [];
    const apply = vi.fn();
    const batch = createFrameZoomBatch((run) => { frames.push(run); }, apply);
    for (let index = 0; index < 500; index += 1) batch.push({ x: index, y: 1, deltaY: -10 });
    for (let index = 0; index < 50; index += 1) batch.push({ x: 7, y: 8, scale: 2 });
    expect(frames).toHaveLength(1);
    expect(apply).not.toHaveBeenCalled();
    frames.shift()!();
    expect(apply).toHaveBeenCalledExactlyOnceWith({ point: { x: 7, y: 8 }, deltaY: -1000, scale: 2 });
    batch.push({ x: 1, y: 1, scale: 0.5 });
    batch.push({ x: 1, y: 1, scale: 0.5 });
    expect(frames).toHaveLength(1);
    frames.shift()!();
    expect(apply).toHaveBeenLastCalledWith({ point: { x: 1, y: 1 }, deltaY: 0, scale: 0.5 });
    expect(apply).toHaveBeenCalledTimes(2);
  });
  it("drops what is pending when cancelled", () => {
    const frames: (() => void)[] = [];
    const apply = vi.fn();
    const batch = createFrameZoomBatch((run) => { frames.push(run); }, apply);
    batch.push({ x: 1, y: 1, deltaY: 5 });
    batch.cancel();
    frames.forEach((run) => run());
    expect(apply).not.toHaveBeenCalled();
  });
});

describe("stepZoom", () => {
  it("steps by 25%", () => {
    expect(stepZoom(1, 1)).toBe(1.25);
    expect(stepZoom(1.25, -1)).toBe(1);
  });
});
