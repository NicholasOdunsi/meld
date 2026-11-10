import { describe, expect, it } from "vitest";
import { createComposeLimiter } from "./compose-rate-limit";

describe("createComposeLimiter", () => {
  it("allows the limit, then refuses, then recovers after the window", () => {
    let now = 0;
    const limiter = createComposeLimiter({ limit: 2, windowMs: 1000, now: () => now });
    expect(limiter.take("a")).toBe(true);
    expect(limiter.take("a")).toBe(true);
    expect(limiter.take("a")).toBe(false);
    expect(limiter.take("b")).toBe(true);
    now = 1001;
    expect(limiter.take("a")).toBe(true);
  });
});
