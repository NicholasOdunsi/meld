import { describe, expect, it, vi } from "vitest";
import {
  consumePairAttempt,
  pairRateLimitKey,
  pairingClientAddress,
} from "./pair-rate-limit";

function request(headers: HeadersInit = {}) {
  return new Request("http://localhost/api/devices/pair", { headers });
}

describe("pair rate limit", () => {
  it("prefers a valid real-IP header", () => {
    const input = request({
      "x-real-ip": "203.0.113.10",
      "x-forwarded-for": "198.51.100.1, 198.51.100.2",
    });

    expect(pairingClientAddress(input)).toBe("203.0.113.10");
  });

  it("uses the rightmost valid forwarded address", () => {
    const input = request({
      "x-forwarded-for": "spoofed, 198.51.100.1, 2001:db8::1",
    });

    expect(pairingClientAddress(input)).toBe("2001:db8::1");
  });

  it("uses one fallback bucket for invalid forwarding metadata", () => {
    expect(pairRateLimitKey(request({ "x-real-ip": "not-an-ip" }))).toBe(
      pairRateLimitKey(request()),
    );
  });

  it("hashes addresses before using them as database keys", () => {
    const input = request({ "x-real-ip": "203.0.113.10" });
    const key = pairRateLimitKey(input);

    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).not.toContain("203.0.113.10");
  });

  it("delegates attempt consumption to the atomic RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });

    await expect(
      consumePairAttempt({ rpc } as never, "a".repeat(64)),
    ).resolves.toEqual({ allowed: true });
    expect(rpc).toHaveBeenCalledWith("consume_device_pair_attempt", {
      target_client_key: "a".repeat(64),
    });
  });

  it("fails closed when the limiter RPC is unavailable", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: {} });

    await expect(
      consumePairAttempt({ rpc } as never, "a".repeat(64)),
    ).rejects.toThrow("rate limiter is unavailable");
  });
});
