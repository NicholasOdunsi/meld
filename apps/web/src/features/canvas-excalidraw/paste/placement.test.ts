import { describe, expect, it } from "vitest";
import { sceneToContainer } from "../chrome/selection";
import { centredPosition } from "./placement";

describe("centredPosition", () => {
  it("centres a frame of the given size in the visible board", () => {
    expect(centredPosition({ scrollX: 0, scrollY: 0, zoom: 1, width: 1000, height: 800 }, { w: 390, h: 844 })).toEqual({ x: 305, y: -22 });
  });
  it("accounts for scroll and zoom", () => {
    const view = { scrollX: 100, scrollY: -50, zoom: 2, width: 1000, height: 800 };
    const size = { w: 390, h: 844 };
    const at = centredPosition(view, size);
    expect(sceneToContainer({ x: at.x + size.w / 2, y: at.y + size.h / 2 }, view)).toEqual({ x: 500, y: 400 });
  });
});
