import {
  PER_KEY_FAILURE_LIMIT,
  createFailureRateLimiter,
} from "@/features/ai/pair-rate-limit";

// Separate instance from device pairing so the two flows can't lock each
// other out.
const shelfConnectLimiter = createFailureRateLimiter();

export const SHELF_CONNECT_FAILURE_LIMIT = PER_KEY_FAILURE_LIMIT;

export function consumeShelfConnectAttempt(key: string) {
  return shelfConnectLimiter.consume(key);
}

export function recordShelfConnectFailure(key: string) {
  shelfConnectLimiter.recordFailure(key);
}

export function resetShelfRateLimit() {
  shelfConnectLimiter.reset();
}
