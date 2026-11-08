/**
 * This limiter is intentionally in-process, matching the gateway design's
 * single-instance constraint. With horizontal scaling, the ceilings degrade
 * to per-instance limits rather than disappearing entirely.
 *
 * The per-key ceiling stops one client; the global ceiling still holds when a
 * client rotates keys (x-forwarded-for is caller-controlled).
 */

export const PER_KEY_FAILURE_LIMIT = 10;
export const GLOBAL_FAILURE_LIMIT = 200;
const WINDOW_MS = 10 * 60 * 1000;

export type FailureRateLimiter = {
  consume(key: string): { allowed: boolean };
  recordFailure(key: string): void;
  reset(): void;
};

export function createFailureRateLimiter(): FailureRateLimiter {
  const failuresByKey = new Map<string, number[]>();

  function recentFailures(key: string, now: number) {
    const recent = (failuresByKey.get(key) ?? []).filter(
      (timestamp) => now - timestamp <= WINDOW_MS,
    );

    if (recent.length === 0) {
      failuresByKey.delete(key);
    } else {
      failuresByKey.set(key, recent);
    }

    return recent;
  }

  function globalFailureCount(now: number) {
    let count = 0;

    for (const key of failuresByKey.keys()) {
      count += recentFailures(key, now).length;
    }

    return count;
  }

  return {
    consume(key) {
      const now = Date.now();
      return {
        allowed:
          recentFailures(key, now).length < PER_KEY_FAILURE_LIMIT &&
          globalFailureCount(now) < GLOBAL_FAILURE_LIMIT,
      };
    },
    recordFailure(key) {
      const now = Date.now();
      failuresByKey.set(key, [...recentFailures(key, now), now]);
    },
    reset() {
      failuresByKey.clear();
    },
  };
}

const pairLimiter = createFailureRateLimiter();

export function consumePairAttempt(key: string) {
  return pairLimiter.consume(key);
}

export function recordPairFailure(key: string) {
  pairLimiter.recordFailure(key);
}

export function resetPairRateLimit() {
  pairLimiter.reset();
}
