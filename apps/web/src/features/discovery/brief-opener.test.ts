import { describe, expect, it } from "vitest";
import { buildBriefOpener, PRODUCT_AGENT_MENTION } from "./brief-opener";

describe("buildBriefOpener", () => {
  it("exposes the exact mention text createRoomFromBrief posts with", () => {
    expect(PRODUCT_AGENT_MENTION).toBe("@Product Agent");
  });

  it("uses singular copy for exactly one file", () => {
    expect(buildBriefOpener(1)).toBe(
      "@Product Agent — please review this brief and give me a breakdown of it.",
    );
  });

  it("uses plural copy for two files", () => {
    expect(buildBriefOpener(2)).toBe(
      "@Product Agent — please review these documents and give me a breakdown of them.",
    );
  });

  it("uses the same plural copy for three files", () => {
    expect(buildBriefOpener(3)).toBe(
      "@Product Agent — please review these documents and give me a breakdown of them.",
    );
  });
});
