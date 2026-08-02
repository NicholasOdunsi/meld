import { describe, expect, it } from "vitest";
import { nextBackoffDelay } from "./backoff";

describe("nextBackoffDelay", () => {
  it("doubles from one second and caps the base at thirty seconds", () => {
    expect(
      Array.from({ length: 8 }, (_, attempt) =>
        nextBackoffDelay(attempt, () => 1),
      ),
    ).toEqual([
      1_000,
      2_000,
      4_000,
      8_000,
      16_000,
      30_000,
      30_000,
      30_000,
    ]);
  });

  it("keeps jitter between half of the base and the full base", () => {
    expect(nextBackoffDelay(0, () => 0)).toBe(500);
    expect(nextBackoffDelay(0, () => 0.5)).toBe(750);
    expect(nextBackoffDelay(0, () => 1)).toBe(1_000);
    expect(nextBackoffDelay(5, () => 0)).toBe(15_000);
    expect(nextBackoffDelay(5, () => 1)).toBe(30_000);
  });
});
