import { describe, expect, it } from "vitest";
import { TASTE_SYSTEM_PROMPT } from "./taste-prompt";

describe("TASTE_SYSTEM_PROMPT", () => {
  it("carries the thresholds, limits and the untrusted-data rule", () => {
    expect(TASTE_SYSTEM_PROMPT).toMatch(/at least 3 of the 5 newest/);
    expect(TASTE_SYSTEM_PROMPT).toMatch(/30%/);
    expect(TASTE_SYSTEM_PROMPT).toMatch(/at most 5 suggestions/);
    expect(TASTE_SYSTEM_PROMPT).toMatch(/untrusted/i);
    expect(TASTE_SYSTEM_PROMPT).toContain("airy, light, balanced, compact, dense");
  });
});
