import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getClaims: vi.fn(),
  revokeDevice: vi.fn(),
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
    revokeDevice: mocks.revokeDevice,
  };
});

import { DeviceServiceError } from "@/features/ai/device-service";
import { POST } from "./route";

const DEVICE_ID = "20000000-0000-4000-8000-000000000002";

function request() {
  return new Request(
    `http://localhost/api/devices/${DEVICE_ID}/revoke`,
    { method: "POST" },
  );
}

function context(deviceId = DEVICE_ID) {
  return { params: Promise.resolve({ deviceId }) };
}

describe("POST /api/devices/:deviceId/revoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: "80000000-0000-4000-8000-000000000008" } },
      error: null,
    });
    mocks.createClient.mockResolvedValue({
      auth: { getClaims: mocks.getClaims },
      rpc: vi.fn(),
    });
    mocks.revokeDevice.mockResolvedValue(undefined);
  });

  it("returns 401 before any RPC runs when the session is missing", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: null },
      error: null,
    });

    const response = await POST(request(), context());

    expect(response.status).toBe(401);
    expect(mocks.revokeDevice).not.toHaveBeenCalled();
  });

  it("revokes an authenticated device", async () => {
    const response = await POST(request(), context());

    expect(response.status).toBe(204);
    expect(mocks.revokeDevice).toHaveBeenCalledWith(
      expect.objectContaining({ auth: expect.any(Object) }),
      DEVICE_ID,
    );
  });

  it("maps invalid_execution_device to 404", async () => {
    mocks.revokeDevice.mockRejectedValue(
      new DeviceServiceError("invalid_execution_device"),
    );

    const response = await POST(request(), context());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Device not found.",
    });
  });
});
