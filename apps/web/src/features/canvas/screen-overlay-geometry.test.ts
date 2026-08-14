import { describe, expect, it } from "vitest";
import { overlayRectForFrame } from "./screen-overlay-geometry";

describe("overlayRectForFrame", () => {
  it("maps page bounds at zoom one without camera movement", () => {
    expect(
      overlayRectForFrame(
        { x: 100, y: 50, w: 390, h: 844 },
        { x: 0, y: 0 },
        { x: 0, y: 0, z: 1 },
      ),
    ).toEqual({ left: 100, top: 50, width: 390, height: 844 });
  });

  it("applies camera pan and zoom", () => {
    expect(
      overlayRectForFrame(
        { x: 100, y: 50, w: 390, h: 844 },
        { x: 0, y: 0 },
        { x: -50, y: -10, z: 2 },
      ),
    ).toEqual({ left: 100, top: 80, width: 780, height: 1688 });
  });

  it("cancels the screen-space origin for viewport-relative positioning", () => {
    expect(
      overlayRectForFrame(
        { x: 100, y: 50, w: 390, h: 844 },
        { x: 24, y: 16 },
        { x: 0, y: 0, z: 1 },
      ),
    ).toEqual({ left: 100, top: 50, width: 390, height: 844 });
  });
});
