const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

export function nextBackoffDelay(
  attempt: number,
  random: () => number = Math.random,
): number {
  const normalizedAttempt = Math.max(0, Math.floor(attempt));
  const base = Math.min(
    INITIAL_BACKOFF_MS * 2 ** normalizedAttempt,
    MAX_BACKOFF_MS,
  );
  const jitter = Math.min(1, Math.max(0, random()));

  return base / 2 + (base / 2) * jitter;
}
