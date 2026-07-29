import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createPairingCode: vi.fn(),
  getClaims: vi.fn(),
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
    createPairingCode: mocks.createPairingCode,
  };
});

import { POST } from "./route";

function request(body: string | object = { requestedProvider: "codex" }) {
  return new Request(
    "http://localhost/api/devices/pairing-codes",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    },
  );
}

describe("POST /api/devices/pairing-codes", () => {
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
    mocks.createPairingCode.mockResolvedValue({
      code: "ABCD1234",
      expiresAt: "2026-07-28T12:10:00.000Z",
    });
  });

  it("returns 401 before any RPC runs when the session is missing", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: null },
      error: null,
    });

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mocks.createPairingCode).not.toHaveBeenCalled();
  });

  it("creates a pairing code for an authenticated user", async () => {
    const response = await POST(request());

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      code: "ABCD1234",
      expiresAt: "2026-07-28T12:10:00.000Z",
    });
    expect(mocks.createPairingCode).toHaveBeenCalledWith(
      expect.objectContaining({ auth: expect.any(Object) }),
      { requestedProvider: "codex" },
    );
  });
});
