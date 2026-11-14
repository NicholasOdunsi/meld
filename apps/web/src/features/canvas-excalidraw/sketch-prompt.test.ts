import { describe, expect, it } from "vitest";
import { buildSketchPrompt } from "./sketch-prompt";

describe("buildSketchPrompt", () => {
  const request = {
    width: 480,
    height: 640,
    geometry: [
      { type: "rectangle", x: 10, y: 20, width: 200, height: 40 },
      { type: "text", x: 12, y: 24, width: 80, height: 20, text: "Email" },
    ],
  };
  it("states the frame size and lists each shape with its text", () => {
    const { user } = buildSketchPrompt(request);
    expect(user).toContain("480 x 640");
    expect(user).toContain("rectangle 200x40 at (10, 20)");
    expect(user).toContain('text 80x20 at (12, 24) "Email"');
  });
  it("tells the model how to link screens and what it may not load", () => {
    const { system } = buildSketchPrompt(request);
    expect(system).toContain("data-goto");
    expect(system).toContain("screenKey");
    expect(system).toMatch(/no external|inline/i);
  });
  it("lists at most 100 shapes and says when it trimmed", () => {
    const many = { ...request, geometry: Array(150).fill(request.geometry[0]) };
    const lines = buildSketchPrompt(many).user.split("\n").filter((line) => line.startsWith("- "));
    expect(lines).toHaveLength(100);
    expect(buildSketchPrompt(many).user).toContain("50 more shapes not listed");
  });
});
