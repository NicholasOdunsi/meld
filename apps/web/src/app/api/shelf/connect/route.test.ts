import { hashToken } from "@meld/device-auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createShelfServerClient: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/shelf-server", () => ({ createShelfServerClient: mocks.createShelfServerClient }));

import { SHELF_CONNECT_FAILURE_LIMIT, resetShelfRateLimit } from "@/features/inspiration/shelf-rate-limit";
import { POST } from "./route";

const WORKSPACE = "33333333-3333-4333-8333-333333333333";

function connectRequest(body: unknown) {
  return new Request("http://localhost/api/shelf/connect", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "9.9.9.9" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/shelf/connect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetShelfRateLimit();
    mocks.createShelfServerClient.mockReturnValue({ rpc: mocks.rpc });
    mocks.rpc.mockResolvedValue({ data: { workspace_id: WORKSPACE, workspace_name: "Mine" }, error: null });
  });

  it("redeems the normalized code hash and returns a fresh token", async () => {
    const response = await POST(connectRequest({ code: "abcd-1234", deviceName: "Studio Mac" }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({ token: expect.stringMatching(/^orion_cap_[A-Za-z0-9_-]{43}$/), workspaceId: WORKSPACE, workspaceName: "Mine" });
    expect(mocks.rpc).toHaveBeenCalledWith("redeem_capture_connect_code", {
      connect_code_hash: hashToken("ABCD1234"),
      new_token_hash: hashToken(body.token),
      new_device_name: "Studio Mac",
    });
  });

  it("answers invalid_code for bad JSON, a bad body, or a rejected code", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "invalid_code" } });
    for (const body of ["{", { code: "" }, { code: "ABCD1234", deviceName: "Mac" }]) {
      const response = await POST(connectRequest(body));
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("invalid_code");
    }
  });

  it("rate-limits repeated failures from one address", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "invalid_code" } });
    for (let attempt = 0; attempt < SHELF_CONNECT_FAILURE_LIMIT; attempt += 1) {
      await POST(connectRequest({ code: "ABCD1234", deviceName: "Mac" }));
    }
    const response = await POST(connectRequest({ code: "ABCD1234", deviceName: "Mac" }));
    expect(response.status).toBe(429);
  });

  it("answers unavailable when the server is misconfigured, logging no secrets", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.createShelfServerClient.mockImplementation(() => {
      throw new Error("Invalid shelf configuration: MELD_SHELF_SERVICE_ROLE_KEY");
    });
    const response = await POST(connectRequest({ code: "ABCD1234", deviceName: "Mac" }));
    expect(response.status).toBe(503);
    expect(JSON.stringify(error.mock.calls)).not.toContain("ABCD1234");
    error.mockRestore();
  });
});
