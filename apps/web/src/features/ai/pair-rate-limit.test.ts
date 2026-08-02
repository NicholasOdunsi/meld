import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  GLOBAL_FAILURE_LIMIT,
  PER_KEY_FAILURE_LIMIT,
  consumePairAttempt,
  recordPairFailure,
  resetPairRateLimit,
} from "./pair-rate-limit";

describe("pair rate limit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetPairRateLimit();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows attempts until the per-key failure limit is reached", () => {
    for (
      let attempt = 0;
      attempt < PER_KEY_FAILURE_LIMIT;
      attempt += 1
    ) {
      expect(consumePairAttempt("1.2.3.4").allowed).toBe(true);
      recordPairFailure("1.2.3.4");
    }

    expect(consumePairAttempt("1.2.3.4").allowed).toBe(false);
    expect(consumePairAttempt("5.6.7.8").allowed).toBe(true);
  });

  it("forgets failures once the window passes", () => {
    for (
      let attempt = 0;
      attempt < PER_KEY_FAILURE_LIMIT;
      attempt += 1
    ) {
      recordPairFailure("1.2.3.4");
    }
    expect(consumePairAttempt("1.2.3.4").allowed).toBe(false);

    vi.advanceTimersByTime(10 * 60 * 1000 + 1);

    expect(consumePairAttempt("1.2.3.4").allowed).toBe(true);
  });

  it("blocks every key once the global failure limit is reached", () => {
    for (
      let attempt = 0;
      attempt < GLOBAL_FAILURE_LIMIT;
      attempt += 1
    ) {
      recordPairFailure(`key-${attempt}`);
    }

    expect(consumePairAttempt("fresh-key").allowed).toBe(false);
  });

  it("does not count successful redemptions", () => {
    for (
      let attempt = 0;
      attempt < PER_KEY_FAILURE_LIMIT * 2;
      attempt += 1
    ) {
      expect(consumePairAttempt("1.2.3.4").allowed).toBe(true);
    }
  });
});
