import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createDevicePairingServerClient: vi.fn(),
  redeemPairingCode: vi.fn(),
}));

vi.mock("@/lib/supabase/device-pairing-server", () => ({
  createDevicePairingServerClient:
    mocks.createDevicePairingServerClient,
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
    mocks.createDevicePairingServerClient.mockReturnValue({
      rpc: vi.fn(),
    });
    mocks.redeemPairingCode.mockResolvedValue({
      deviceId: DEVICE_ID,
      deviceToken: DEVICE_TOKEN,
      requestedProvider: "codex",
    });
  });

  it("redeems without requiring a Supabase session", async () => {
    const response = await POST(pairRequest());

    expect(
      mocks.createDevicePairingServerClient,
    ).toHaveBeenCalledOnce();
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

  it("returns a sanitized server error without rate-limiting configuration failures", async () => {
    const serviceRoleKeySentinel = "service-role-key-sentinel";
    const requestCode = "ABCD1234";
    vi.stubEnv(
      "MELD_DEVICE_PAIRING_SERVICE_ROLE_KEY",
      serviceRoleKeySentinel,
    );
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mocks.createDevicePairingServerClient.mockImplementation(() => {
      throw new Error(
        "Invalid device pairing configuration: MELD_DEVICE_PAIRING_SERVICE_ROLE_KEY",
      );
    });

    for (
      let attempt = 0;
      attempt <= PER_KEY_FAILURE_LIMIT;
      attempt += 1
    ) {
      const response = await POST(pairRequest({ code: requestCode }));
      expect(response.status).toBe(500);
      const responseText = await response.text();
      expect(responseText).toBe(
        '{"error":"Device pairing is temporarily unavailable."}',
      );
      expect(responseText).not.toContain(serviceRoleKeySentinel);
      expect(responseText).not.toContain(requestCode);
    }

    expect(errorSpy).toHaveBeenCalledTimes(
      PER_KEY_FAILURE_LIMIT + 1,
    );
    for (const call of errorSpy.mock.calls) {
      expect(call).toHaveLength(1);
      const serializedCall = JSON.stringify(call);
      expect(serializedCall).toContain(
        "MELD_DEVICE_PAIRING_SERVICE_ROLE_KEY",
      );
      expect(serializedCall).not.toContain(serviceRoleKeySentinel);
      expect(serializedCall).not.toContain(requestCode);
    }
    expect(mocks.redeemPairingCode).not.toHaveBeenCalled();

    errorSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it("names a missing public Supabase URL from the safe configuration allowlist", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mocks.createDevicePairingServerClient.mockImplementation(() => {
      throw new Error(
        "Invalid device pairing configuration: NEXT_PUBLIC_SUPABASE_URL",
      );
    });

    const response = await POST(pairRequest());

    expect(response.status).toBe(500);
    expect(await response.text()).toBe(
      '{"error":"Device pairing is temporarily unavailable."}',
    );
    expect(errorSpy).toHaveBeenCalledWith(
      "Device pairing server configuration error: missing NEXT_PUBLIC_SUPABASE_URL",
    );
    expect(mocks.redeemPairingCode).not.toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it("uses a generic diagnostic for unknown construction failures", async () => {
    const requestCode = "ABCD1234";
    const urlSentinel = "supabase-url-sentinel";
    const serviceRoleKeySentinel = "service-role-key-sentinel";
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", urlSentinel);
    vi.stubEnv(
      "MELD_DEVICE_PAIRING_SERVICE_ROLE_KEY",
      serviceRoleKeySentinel,
    );
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mocks.createDevicePairingServerClient.mockImplementation(() => {
      throw new Error(
        `unknown ${urlSentinel} ${serviceRoleKeySentinel} ${requestCode}`,
      );
    });

    const response = await POST(pairRequest({ code: requestCode }));
    const responseText = await response.text();

    expect(response.status).toBe(500);
    expect(responseText).toBe(
      '{"error":"Device pairing is temporarily unavailable."}',
    );
    expect(errorSpy).toHaveBeenCalledWith(
      "Device pairing server configuration error",
    );
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const serializedLog = JSON.stringify(errorSpy.mock.calls);
    for (const sentinel of [
      urlSentinel,
      serviceRoleKeySentinel,
      requestCode,
    ]) {
      expect(responseText).not.toContain(sentinel);
      expect(serializedLog).not.toContain(sentinel);
    }
    expect(mocks.redeemPairingCode).not.toHaveBeenCalled();

    errorSpy.mockRestore();
    vi.unstubAllEnvs();
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
