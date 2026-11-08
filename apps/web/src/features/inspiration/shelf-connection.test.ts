import { hashToken } from "@meld/device-auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), isRoomFakeEnabled: vi.fn(() => false), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/features/rooms/e2e-gate", () => ({ isRoomFakeEnabled: mocks.isRoomFakeEnabled }));

import { createShelfConnectCode, listShelfTokens, revokeShelfToken } from "./shelf-connection";

const WORKSPACE = "22222222-2222-4222-8222-222222222222";
const TOKEN = "11111111-1111-4111-8111-111111111111";

function tokenQuery(data: unknown) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "order"]) builder[method] = vi.fn(() => builder);
  builder.then = (resolve: (value: unknown) => unknown) => resolve({ data, error: null });
  return builder as Record<string, ReturnType<typeof vi.fn>>;
}

beforeEach(() => vi.clearAllMocks());

describe("createShelfConnectCode", () => {
  it("stores only the code hash and returns the plain code once", async () => {
    mocks.rpc.mockResolvedValue({ data: "2026-11-06T10:10:00.000Z", error: null });
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
    const result = await createShelfConnectCode(WORKSPACE);
    expect(result).toEqual({ status: "created", code: expect.stringMatching(/^[0-9A-Z]{8}$/), expiresAt: "2026-11-06T10:10:00.000Z" });
    if (result.status !== "created") throw new Error("expected created");
    expect(mocks.rpc).toHaveBeenCalledWith("create_capture_connect_code", {
      target_workspace_id: WORKSPACE,
      connect_code_hash: hashToken(result.code),
    });
  });

  it("explains the too-many-codes limit", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "too_many_codes" } });
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
    expect(await createShelfConnectCode(WORKSPACE)).toEqual({
      status: "error",
      message: "Use the code already on screen before making another one.",
    });
  });
});

describe("listShelfTokens", () => {
  it("selects explicit columns only (never token_hash) and active tokens only", async () => {
    const tokens = tokenQuery([{ id: TOKEN, device_name: "Studio Mac", created_at: "2026-11-06T10:00:00.000Z", last_used_at: null }]);
    mocks.createClient.mockResolvedValue({ from: vi.fn(() => tokens) });
    expect(await listShelfTokens(WORKSPACE)).toEqual([
      { id: TOKEN, deviceName: "Studio Mac", createdAt: "2026-11-06T10:00:00.000Z", lastUsedAt: null },
    ]);
    expect(tokens.select).toHaveBeenCalledWith("id,device_name,created_at,last_used_at");
    expect(tokens.is).toHaveBeenCalledWith("revoked_at", null);
  });
});

describe("revokeShelfToken", () => {
  it("revokes through the RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
    expect(await revokeShelfToken(TOKEN)).toEqual({ status: "revoked" });
    expect(mocks.rpc).toHaveBeenCalledWith("revoke_capture_token", { target_token_id: TOKEN });
  });
});
