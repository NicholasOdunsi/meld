import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createShelfServerClient: vi.fn(),
  authenticateShelfRequest: vi.fn(),
  resetTile: vi.fn(),
}));
vi.mock("@/lib/supabase/shelf-server", () => ({ createShelfServerClient: mocks.createShelfServerClient }));
vi.mock("@/features/inspiration/shelf-auth", () => ({ authenticateShelfRequest: mocks.authenticateShelfRequest }));
vi.mock("@/features/rooms/e2e-gate", () => ({ isRoomFakeEnabled: () => false }));
vi.mock("@/features/inspiration/shelf-taste", () => ({
  createShelfTaste: () => ({ resetTile: mocks.resetTile }),
  createFakeShelfTaste: () => ({ resetTile: mocks.resetTile }),
}));

import { POST } from "./route";

const PRINCIPAL = {
  tokenId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  workspaceId: "33333333-3333-4333-8333-333333333333",
};
const post = (body: unknown) =>
  POST(new Request("http://localhost/api/shelf/taste/reset-tile", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/shelf/taste/reset-tile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createShelfServerClient.mockReturnValue({});
    mocks.authenticateShelfRequest.mockResolvedValue(PRINCIPAL);
  });

  it("clears the lock and returns the tile", async () => {
    mocks.resetTile.mockResolvedValue({ ok: true, value: { tile: "density" } });
    const response = await post({ tile: "density" });
    expect(mocks.resetTile).toHaveBeenCalledWith("density");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ tile: "density" });
  });

  it("422s on a bad tile", async () => {
    expect((await post({ tile: "mood" })).status).toBe(422);
    expect(mocks.resetTile).not.toHaveBeenCalled();
  });
});
