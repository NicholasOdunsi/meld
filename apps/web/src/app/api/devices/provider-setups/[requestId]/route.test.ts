import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getProviderSetup: vi.fn(),
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
    getProviderSetup: mocks.getProviderSetup,
  };
});

import { GET } from "./route";
import { ProviderSetupServiceError } from "@/features/ai/provider-setup-service";

const REQUEST_ID = "70000000-0000-4000-8000-000000000007";
const DEVICE_ID = "20000000-0000-4000-8000-000000000002";

function request() {
  return new Request(
    `http://localhost/api/devices/provider-setups/${REQUEST_ID}`,
  );
}

function context(requestId = REQUEST_ID) {
  return { params: Promise.resolve({ requestId }) };
}

function view() {
  return {
    id: REQUEST_ID,
    deviceId: DEVICE_ID,
    provider: "claude",
    status: "verifying",
    stage: "verifying",
    progressMessage: "Verifying the connection",
    errorCode: null,
    errorMessage: null,
    updatedAt: "2026-07-29T12:02:00.000Z",
  };
}

describe("GET /api/devices/provider-setups/:requestId", () => {
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
    mocks.getProviderSetup.mockResolvedValue(view());
  });

  it("returns 401 before any read when the session is missing", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: null },
      error: null,
    });

    const response = await GET(request(), context());

    expect(response.status).toBe(401);
    expect(mocks.getProviderSetup).not.toHaveBeenCalled();
  });

  it("rejects a non-uuid request id with 400", async () => {
    const response = await GET(request(), context("not-a-uuid"));

    expect(response.status).toBe(400);
    expect(mocks.getProviderSetup).not.toHaveBeenCalled();
  });

  it("returns the durable setup view for the authenticated user", async () => {
    const response = await GET(request(), context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(view());
    expect(mocks.getProviderSetup).toHaveBeenCalledWith(
      expect.objectContaining({ auth: expect.any(Object) }),
      REQUEST_ID,
    );
  });

  it("never exposes provider paths or credentials in the response body", async () => {
    const response = await GET(request(), context());
    const body = await response.text();

    expect(body).not.toMatch(/Library|Keychain|token|credential|path/i);
  });

  it("maps a missing request to a stable 404", async () => {
    mocks.getProviderSetup.mockRejectedValue(
      new ProviderSetupServiceError("not_found"),
    );

    const response = await GET(request(), context());

    expect(response.status).toBe(404);
  });

  it("maps an unexpected failure to a stable 409", async () => {
    mocks.getProviderSetup.mockRejectedValue(
      new ProviderSetupServiceError("provider_setup_failed"),
    );

    const response = await GET(request(), context());

    expect(response.status).toBe(409);
  });
});
