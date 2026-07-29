import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  redeemPairingCode: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/features/ai/device-service", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("@/features/ai/device-service")
    >();
  return {
    ...original,
    redeemPairingCode: mocks.redeemPairingCode,
  };
});

import { DeviceServiceError } from "@/features/ai/device-service";
import {
  PER_KEY_FAILURE_LIMIT,
  resetPairRateLimit,
} from "@/features/ai/pair-rate-limit";
import { POST } from "./route";

const DEVICE_ID = "20000000-0000-4000-8000-000000000002";
const DEVICE_TOKEN = "a".repeat(43);

function pairRequest(
  overrides: Record<string, unknown> = {},
  variant?: string,
) {
  return new Request("http://localhost/api/devices/pair", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "1.2.3.4",
    },
    body: JSON.stringify({
      code: "ABCD1234",
      platform: "darwin",
      name: variant ?? "Studio Mac",
      ...overrides,
    }),
  });
}

describe("POST /api/devices/pair", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPairRateLimit();
    mocks.createClient.mockResolvedValue({ rpc: vi.fn() });
    mocks.redeemPairingCode.mockResolvedValue({
      deviceId: DEVICE_ID,
      deviceToken: DEVICE_TOKEN,
      requestedProvider: "codex",
    });
  });

  it("redeems without requiring a Supabase session", async () => {
    const response = await POST(pairRequest());

    expect(mocks.createClient).toHaveBeenCalledWith(
      expect.any(Headers),
    );
    expect(mocks.redeemPairingCode).toHaveBeenCalledWith(
      expect.objectContaining({ rpc: expect.any(Function) }),
      {
        code: "ABCD1234",
        platform: "darwin",
        name: "Studio Mac",
      },
    );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      deviceId: DEVICE_ID,
      deviceToken: DEVICE_TOKEN,
      requestedProvider: "codex",
    });
  });

  it("returns identical responses for unknown, expired, and redeemed codes", async () => {
    mocks.redeemPairingCode.mockRejectedValue(
      new DeviceServiceError("invalid_pairing_code"),
    );

    const responses = await Promise.all(
      ["unknown", "expired", "redeemed"].map((variant) =>
        POST(pairRequest({ code: "ABCD1234" }, variant)),
      ),
    );

    const bodies = await Promise.all(
      responses.map((response) => response.text()),
    );
    expect(new Set(responses.map((response) => response.status))).toEqual(
      new Set([400]),
    );
    expect(new Set(bodies).size).toBe(1);
  });

  it("returns 429 once the rate limit is exhausted", async () => {
    mocks.redeemPairingCode.mockRejectedValue(
      new DeviceServiceError("invalid_pairing_code"),
    );

    for (
      let attempt = 0;
      attempt < PER_KEY_FAILURE_LIMIT;
      attempt += 1
    ) {
      const response = await POST(pairRequest());
      expect(response.status).toBe(400);
    }

    const response = await POST(pairRequest());

    expect(response.status).toBe(429);
    expect(mocks.redeemPairingCode).toHaveBeenCalledTimes(
      PER_KEY_FAILURE_LIMIT,
    );
  });

  it("counts malformed and schema-invalid requests as failures", async () => {
    for (
      let attempt = 0;
      attempt < PER_KEY_FAILURE_LIMIT;
      attempt += 1
    ) {
      const response = await POST(
        new Request("http://localhost/api/devices/pair", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": "1.2.3.4",
          },
          body: attempt % 2 === 0 ? "{" : JSON.stringify({}),
        }),
      );
      expect(response.status).toBe(400);
    }

    expect((await POST(pairRequest())).status).toBe(429);
  });

  it("counts client construction failures and returns a controlled response", async () => {
    mocks.createClient.mockRejectedValue(
      new Error("private Supabase configuration detail"),
    );

    for (
      let attempt = 0;
      attempt < PER_KEY_FAILURE_LIMIT;
      attempt += 1
    ) {
      const response = await POST(pairRequest());
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "Invalid or expired pairing code.",
      });
    }

    const response = await POST(pairRequest());

    expect(response.status).toBe(429);
    expect(await response.text()).not.toContain(
      "private Supabase configuration detail",
    );
  });

  it("returns the device token exactly once and never logs it", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const response = await POST(pairRequest());
    const text = await response.text();
    const body = JSON.parse(text);

    expect(body.deviceToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(text.match(new RegExp(body.deviceToken, "g"))).toHaveLength(
      1,
    );
    for (const call of errorSpy.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(body.deviceToken);
    }
    errorSpy.mockRestore();
  });
});
