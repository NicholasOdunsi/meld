import { describe, expect, it } from "vitest";
import { isOrionMacUserAgent } from "./user-agent";

describe("isOrionMacUserAgent", () => {
  it("recognises the Orion Mac app", () => {
    expect(isOrionMacUserAgent("Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 OrionMac/1.0.12")).toBe(true);
  });
  it.each(["Mozilla/5.0 Safari/605.1.15", "NotOrionMac/1.0", ""])("ignores %s", (ua) => {
    expect(isOrionMacUserAgent(ua)).toBe(false);
  });
});
