/**
 * Best-effort per-instance in-memory limiter (like the existing pair limiter).
 * On serverless, each instance has its own map — not a global quota.
 */
export function createComposeLimiter({
  limit = 10,
  windowMs = 10 * 60 * 1000,
  now = () => Date.now(),
}: { limit?: number; windowMs?: number; now?: () => number } = {}) {
  const hits = new Map<string, number[]>();
  return {
    take(key: string): boolean {
      const cutoff = now() - windowMs;
      const recent = (hits.get(key) ?? []).filter((at) => at > cutoff);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now());
      hits.set(key, recent);
      return true;
    },
  };
}

export const composeLimiter = createComposeLimiter();
