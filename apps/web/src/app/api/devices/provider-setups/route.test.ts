import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createProviderSetup: vi.fn(),
  listActiveProviderSetups: vi.fn(),
  getClaims: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/features/ai/provider-setup-service", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("@/features/ai/provider-setup-service")
    >();
  return {
    ...original,
    createProviderSetup: mocks.createProviderSetup,
    listActiveProviderSetups: mocks.listActiveProviderSetups,
  };
});

import { GET, POST } from "./route";
import { ProviderSetupServiceError } from "@/features/ai/provider-setup-service";

const REQUEST_ID = "70000000-0000-4000-8000-000000000007";
const DEVICE_ID = "20000000-0000-4000-8000-000000000002";

function request(body: string | object = { deviceId: DEVICE_ID, provider: "codex" }) {
  return new Request("http://localhost/api/devices/provider-setups", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function view() {
  return {
    id: REQUEST_ID,
    deviceId: DEVICE_ID,
    provider: "codex",
    status: "queued",
    stage: null,
    progressMessage: null,
    errorCode: null,
    errorMessage: null,
    updatedAt: "2026-07-29T12:00:00.000Z",
  };
}

describe("POST /api/devices/provider-setups", () => {
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
    mocks.createProviderSetup.mockResolvedValue(view());
    mocks.listActiveProviderSetups.mockResolvedValue([view()]);
  });

  it("returns 401 before any RPC runs when the session is missing", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: null },
      error: null,
    });

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mocks.createProviderSetup).not.toHaveBeenCalled();
  });

  it("creates a provider setup for an authenticated user", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(view());
    expect(mocks.createProviderSetup).toHaveBeenCalledWith(
      expect.objectContaining({ auth: expect.any(Object) }),
      { deviceId: DEVICE_ID, provider: "codex" },
    );
  });

  it("never exposes provider paths or credentials in the response body", async () => {
    const response = await POST(request());
    const body = await response.text();

    expect(body).not.toMatch(/Library|Keychain|token|credential|path/i);
  });

  it("rejects a malformed body with 400 before touching the service", async () => {
    const response = await POST(request("not-json"));

    expect(response.status).toBe(400);
    expect(mocks.createProviderSetup).not.toHaveBeenCalled();
  });

  it("rejects an unknown provider with 400", async () => {
    const response = await POST(
      request({ deviceId: DEVICE_ID, provider: "gemini" }),
    );

    expect(response.status).toBe(400);
    expect(mocks.createProviderSetup).not.toHaveBeenCalled();
  });

  it("maps a not_found device to a stable 404", async () => {
    mocks.createProviderSetup.mockRejectedValue(
      new ProviderSetupServiceError("not_found"),
    );

    const response = await POST(request());

    expect(response.status).toBe(404);
  });

  it("maps an unexpected failure to a stable 409", async () => {
    mocks.createProviderSetup.mockRejectedValue(
      new ProviderSetupServiceError("provider_setup_failed"),
    );

    const response = await POST(request());

    expect(response.status).toBe(409);
  });
});

describe("GET /api/devices/provider-setups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: "80000000-0000-4000-8000-000000000008" } },
      error: null,
    });
    mocks.createClient.mockResolvedValue({
      auth: { getClaims: mocks.getClaims },
      from: vi.fn(),
    });
    mocks.listActiveProviderSetups.mockResolvedValue([view()]);
  });

  it("returns 401 before any read when the session is missing", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: null },
      error: null,
    });

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.listActiveProviderSetups).not.toHaveBeenCalled();
  });

  it("returns the caller's active setups", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([view()]);
    expect(mocks.listActiveProviderSetups).toHaveBeenCalledWith(
      expect.objectContaining({ auth: expect.any(Object) }),
    );
  });

  it("never exposes provider paths or credentials in the list body", async () => {
    const response = await GET();
    const body = await response.text();

    expect(body).not.toMatch(/Library|Keychain|token|credential|path/i);
  });

  it("maps an unexpected failure to a stable 409", async () => {
    mocks.listActiveProviderSetups.mockRejectedValue(
      new ProviderSetupServiceError("provider_setup_failed"),
    );

    const response = await GET();

    expect(response.status).toBe(409);
  });
});
