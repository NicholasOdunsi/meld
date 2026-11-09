import { describe, expect, it } from "vitest";
import { isOrionFrameUserAgent, isOrionMacUserAgent } from "./user-agent";

describe("isOrionMacUserAgent", () => {
  it("recognises the Orion Mac app", () => {
    expect(isOrionMacUserAgent("Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 OrionMac/1.0.12")).toBe(true);
  });
  it.each(["Mozilla/5.0 Safari/605.1.15", "NotOrionMac/1.0", ""])("ignores %s", (ua) => {
    expect(isOrionMacUserAgent(ua)).toBe(false);
  });
});

describe("isOrionFrameUserAgent", () => {
  it("recognises the native-frame Mac app", () => {
    expect(isOrionFrameUserAgent("Mozilla/5.0 AppleWebKit/605.1.15 OrionMac/1.1.0 OrionFrame/1")).toBe(true);
  });
  it.each(["Mozilla/5.0 AppleWebKit/605.1.15 OrionMac/1.0.3", "NotOrionFrame/1", ""])("ignores %s", (ua) => {
    expect(isOrionFrameUserAgent(ua)).toBe(false);
  });
});
