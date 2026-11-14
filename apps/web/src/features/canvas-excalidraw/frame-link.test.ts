import { describe, expect, it } from "vitest";
import { frameLink, isFrameLink, screenIdFromLink } from "./frame-link";

describe("frame links", () => {
  it("round-trips a screen id", () => {
    expect(frameLink("welcome")).toBe("orion-screen://welcome");
    expect(screenIdFromLink("orion-screen://welcome")).toBe("welcome");
    expect(isFrameLink("orion-screen://welcome")).toBe(true);
  });
  it("rejects other schemes and malformed ids", () => {
    expect(screenIdFromLink("https://example.com")).toBeNull();
    expect(screenIdFromLink("orion-screen://Bad Id")).toBeNull();
    expect(screenIdFromLink("orion-screen://")).toBeNull();
    expect(screenIdFromLink(null)).toBeNull();
    expect(isFrameLink(undefined)).toBe(false);
  });
  it("refuses to build a link from a bad id", () => {
    expect(() => frameLink("../x")).toThrow();
  });
});
