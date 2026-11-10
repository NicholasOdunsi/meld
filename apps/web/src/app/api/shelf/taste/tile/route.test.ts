import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createShelfServerClient: vi.fn(),
  authenticateShelfRequest: vi.fn(),
  saveTile: vi.fn(),
}));
vi.mock("@/lib/supabase/shelf-server", () => ({ createShelfServerClient: mocks.createShelfServerClient }));
vi.mock("@/features/inspiration/shelf-auth", () => ({ authenticateShelfRequest: mocks.authenticateShelfRequest }));
vi.mock("@/features/rooms/e2e-gate", () => ({ isRoomFakeEnabled: () => false }));
vi.mock("@/features/inspiration/shelf-taste", () => ({
  createShelfTaste: () => ({ saveTile: mocks.saveTile }),
  createFakeShelfTaste: () => ({ saveTile: mocks.saveTile }),
}));

import { PUT } from "./route";

const PRINCIPAL = {
  tokenId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  workspaceId: "33333333-3333-4333-8333-333333333333",
};
const put = (body: unknown) =>
  PUT(new Request("http://localhost/api/shelf/taste/tile", { method: "PUT", body: JSON.stringify(body) }));

describe("PUT /api/shelf/taste/tile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createShelfServerClient.mockReturnValue({});
    mocks.authenticateShelfRequest.mockResolvedValue(PRINCIPAL);
  });

  it("saves a tile and returns the new version", async () => {
    mocks.saveTile.mockResolvedValue({ ok: true, value: { version: 4 } });
    const response = await put({ tile: "density", value: "airy", expectedVersion: 3 });
    expect(mocks.saveTile).toHaveBeenCalledWith({ tile: "density", value: "airy", expectedVersion: 3 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ version: 4 });
  });

  it("409s on a version conflict", async () => {
    mocks.saveTile.mockResolvedValue({ ok: false, error: "conflict" });
    const response = await put({ tile: "density", value: "airy", expectedVersion: 1 });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ status: "conflict" });
  });

  it("422s on a bad body and 401s without a valid key", async () => {
    expect((await put({ tile: "mood", value: 1, expectedVersion: 0 })).status).toBe(422);
    expect(mocks.saveTile).not.toHaveBeenCalled();
    mocks.authenticateShelfRequest.mockResolvedValue(null);
    expect((await put({ tile: "density", value: "airy", expectedVersion: 0 })).status).toBe(401);
  });
});
