/**
 * This limiter is intentionally in-process, matching the gateway design's
 * single-instance constraint. With horizontal scaling, the ceilings degrade
 * to per-instance limits rather than disappearing entirely.
 */

export const PER_KEY_FAILURE_LIMIT = 10;
export const GLOBAL_FAILURE_LIMIT = 200;
const WINDOW_MS = 10 * 60 * 1000;

const failuresByKey = new Map<string, number[]>();
const globalFailuresByKey = new Map<string, number[]>();

function recentFailures(
  failures: Map<string, number[]>,
  key: string,
  now: number,
) {
  const recent = (failures.get(key) ?? []).filter(
    (timestamp) => now - timestamp <= WINDOW_MS,
  );

  if (recent.length === 0) {
    failures.delete(key);
  } else {
    failures.set(key, recent);
  }

  return recent;
}

function globalFailureCount(now: number) {
  let count = 0;

  for (const key of globalFailuresByKey.keys()) {
    count += recentFailures(globalFailuresByKey, key, now).length;
  }

  return count;
}

export function consumePairAttempt(key: string) {
  const now = Date.now();
  return {
    allowed:
      recentFailures(failuresByKey, key, now).length <
        PER_KEY_FAILURE_LIMIT &&
      globalFailureCount(now) < GLOBAL_FAILURE_LIMIT,
  };
}

export function recordPairFailure(key: string) {
  const now = Date.now();

  failuresByKey.set(key, [
    ...recentFailures(failuresByKey, key, now),
    now,
  ]);
  globalFailuresByKey.set(key, [
    ...recentFailures(globalFailuresByKey, key, now),
    now,
  ]);
}

export function resetPairRateLimit() {
  failuresByKey.clear();
  globalFailuresByKey.clear();
}
