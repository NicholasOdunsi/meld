import { describe, expect, it } from "vitest";
import { clampPill } from "./clamp-pill";

// A 1000x800 board; the pill is 176x46; a 12px margin, 72px left inset (the dock), 56px bottom inset (zoom control), 12px gap.
const base = { pill: { w: 176, h: 46 }, viewport: { w: 1000, h: 800 }, margin: 12, leftInset: 72, bottomInset: 56, gap: 12 };
const frameOf = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom });

describe("clampPill", () => {
  it("is centred under the frame, gap below it, when there is room (unchanged)", () => {
    expect(clampPill({ ...base, anchor: { x: 500, y: 400 }, frame: frameOf(400, 100, 600, 400) })).toEqual({ x: 500, y: 412 });
  });
  it("pins to the bottom of the viewport, over the frame, when the frame's bottom is off-screen", () => {
    // Bottom inset 56 + pill 46 => y = 800 - 56 - 46 = 698.
    expect(clampPill({ ...base, anchor: { x: 500, y: 1500 }, frame: frameOf(400, 100, 600, 1500) })).toEqual({ x: 500, y: 698 });
    // The bottom is on screen but too close: still pinned above the inset.
    expect(clampPill({ ...base, anchor: { x: 500, y: 790 }, frame: frameOf(400, 100, 600, 790) })).toEqual({ x: 500, y: 698 });
  });
  it("keeps clear of the dock at the left edge", () => {
    // Centre at least leftInset + w/2 = 160.
    expect(clampPill({ ...base, anchor: { x: 20, y: 400 }, frame: frameOf(-100, 100, 140, 400) })).toEqual({ x: 160, y: 412 });
  });
  it("keeps inside the margin at the right edge", () => {
    // Centre at most 1000 - 12 - 88 = 900.
    expect(clampPill({ ...base, anchor: { x: 990, y: 400 }, frame: frameOf(900, 100, 1200, 400) })).toEqual({ x: 900, y: 412 });
  });
  it("handles a tiny frame like any other", () => {
    expect(clampPill({ ...base, anchor: { x: 500, y: 300 }, frame: frameOf(499, 299, 501, 300) })).toEqual({ x: 500, y: 312 });
  });
  it("renders nothing when the frame is wholly outside the viewport", () => {
    expect(clampPill({ ...base, anchor: { x: 500, y: -50 }, frame: frameOf(400, -400, 600, -50) })).toBeNull();
    expect(clampPill({ ...base, anchor: { x: 1700, y: 400 }, frame: frameOf(1500, 100, 1900, 400) })).toBeNull();
    expect(clampPill({ ...base, anchor: { x: -300, y: 400 }, frame: frameOf(-500, 100, -100, 400) })).toBeNull();
    expect(clampPill({ ...base, anchor: { x: 500, y: 1100 }, frame: frameOf(400, 900, 600, 1100) })).toBeNull();
  });
  it("still shows for a frame that only just touches the viewport", () => {
    expect(clampPill({ ...base, anchor: { x: 500, y: 5 }, frame: frameOf(400, -300, 600, 5) })).toEqual({ x: 500, y: 17 });
  });
  it("never goes above the top margin or to a negative position on a tiny board", () => {
    const small = clampPill({ ...base, viewport: { w: 120, h: 90 }, anchor: { x: 60, y: 40 }, frame: frameOf(10, 10, 110, 40) });
    expect(small).toEqual({ x: 160, y: 12 });
  });
});
