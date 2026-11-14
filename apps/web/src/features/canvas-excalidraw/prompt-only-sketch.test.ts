import { describe, expect, it } from "vitest";
import { promptOnlySketch } from "./prompt-only-sketch";

describe("prompt-only screen", () => {
  it("uses a phone-sized frame for mobile requests", () => {
    expect(promptOnlySketch("build a fintech mobile app")).toEqual({ width: 390, height: 844, geometry: [] });
  });

  it("uses a desktop frame otherwise", () => {
    expect(promptOnlySketch("build an analytics dashboard")).toEqual({ width: 1280, height: 800, geometry: [] });
  });
});
