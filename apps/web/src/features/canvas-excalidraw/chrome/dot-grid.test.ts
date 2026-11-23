import { describe, expect, it } from "vitest";
import { dotGridStyle } from "./dot-grid";

const view = (zoom: number, scrollX = 0, scrollY = 0) => ({ scrollX, scrollY, zoom, width: 1000, height: 800 });

describe("dotGridStyle", () => {
  it("spaces dots 24 board units apart and moves them with the board", () => {
    expect(dotGridStyle(view(1))).toMatchObject({ backgroundSize: "24px 24px", backgroundPosition: "-12px -12px" });
    // scroll 100 at zoom 2: scene 0 sits at 200px; tile is 48px, so its dot centre is at 200 - 24 + 24 = 200.
    expect(dotGridStyle(view(2, 100, -50))).toMatchObject({ backgroundSize: "48px 48px", backgroundPosition: "176px -124px" });
  });
  it("doubles the spacing instead of crowding when zoomed far out", () => {
    // 24 * 0.2 = 4.8 -> 9.6 -> 19.2: every fourth board dot, still on the grid.
    expect(dotGridStyle(view(0.2))).toMatchObject({ backgroundSize: "19.2px 19.2px" });
  });
});
