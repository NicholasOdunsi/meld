import { describe, expect, it } from "vitest";
import { toSketchLayout } from "./sketch-layout-adapter";

describe("toSketchLayout", () => {
  it("buckets shapes by position and size inside the frame, keeping text", () => {
    const layout = toSketchLayout({
      width: 400,
      height: 600,
      geometry: [
        { type: "rectangle", x: 10, y: 10, width: 380, height: 60 },
        { type: "text", x: 150, y: 290, width: 100, height: 20, text: "Welcome" },
        { type: "diamond", x: 300, y: 540, width: 80, height: 40 },
      ],
    });
    expect(layout.truncated).toBe(false);
    expect(layout.boxes[0]).toMatchObject({ shapeKind: "rectangle", position: { vertical: "top", horizontal: "center" }, size: { width: "full" } });
    expect(layout.boxes.find((box) => box.text === "Welcome")).toMatchObject({ shapeKind: "text", position: { vertical: "middle", horizontal: "center" } });
    expect(layout.boxes.at(-1)).toMatchObject({ shapeKind: "other", position: { vertical: "bottom", horizontal: "right" } });
  });
  it("marks a very busy sketch as truncated", () => {
    const geometry = Array.from({ length: 70 }, (_, i) => ({ type: "rectangle", x: i, y: i, width: 10, height: 10 }));
    const layout = toSketchLayout({ width: 400, height: 600, geometry });
    expect(layout.boxes).toHaveLength(60);
    expect(layout.truncated).toBe(true);
  });
});
