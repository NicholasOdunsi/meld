import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GLOBAL_FAILURE_LIMIT } from "@/features/ai/pair-rate-limit";
import {
  SHELF_CONNECT_FAILURE_LIMIT,
  consumeShelfConnectAttempt,
  recordShelfConnectFailure,
  resetShelfRateLimit,
} from "./shelf-rate-limit";

describe("shelf connect rate limit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetShelfRateLimit();
  });
  afterEach(() => vi.useRealTimers());

  it("blocks a key after the failure limit and leaves other keys alone", () => {
    for (let attempt = 0; attempt < SHELF_CONNECT_FAILURE_LIMIT; attempt += 1) {
      expect(consumeShelfConnectAttempt("1.1.1.1").allowed).toBe(true);
      recordShelfConnectFailure("1.1.1.1");
    }
    expect(consumeShelfConnectAttempt("1.1.1.1").allowed).toBe(false);
    expect(consumeShelfConnectAttempt("2.2.2.2").allowed).toBe(true);
  });

  it("blocks every key once the global ceiling is hit (rotating keys)", () => {
    for (let attempt = 0; attempt < GLOBAL_FAILURE_LIMIT; attempt += 1) {
      recordShelfConnectFailure(`spoofed-${attempt}`);
    }
    expect(consumeShelfConnectAttempt("fresh").allowed).toBe(false);
  });

  it("forgets failures after ten minutes", () => {
    for (let attempt = 0; attempt < SHELF_CONNECT_FAILURE_LIMIT; attempt += 1) recordShelfConnectFailure("k");
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    expect(consumeShelfConnectAttempt("k").allowed).toBe(true);
  });
});
