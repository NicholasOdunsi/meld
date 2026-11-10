import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createShelfServerClient: vi.fn(),
  authenticateShelfRequest: vi.fn(),
  list: vi.fn(),
  isRoomFakeEnabled: vi.fn(() => false),
}));
vi.mock("@/lib/supabase/shelf-server", () => ({ createShelfServerClient: mocks.createShelfServerClient }));
vi.mock("@/features/inspiration/shelf-auth", () => ({ authenticateShelfRequest: mocks.authenticateShelfRequest }));
vi.mock("@/features/rooms/e2e-gate", () => ({ isRoomFakeEnabled: mocks.isRoomFakeEnabled }));
vi.mock("@/features/inspiration/shelf-library", () => ({
  createShelfLibrary: () => ({ list: mocks.list }),
  createFakeShelfLibrary: () => ({ list: mocks.list }),
}));

import { GET } from "./route";

const PRINCIPAL = {
  tokenId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  workspaceId: "33333333-3333-4333-8333-333333333333",
};

describe("GET /api/shelf/library", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createShelfServerClient.mockReturnValue({});
  });

  it("401s without a valid token", async () => {
    mocks.authenticateShelfRequest.mockResolvedValue(null);
    expect((await GET(new Request("http://localhost/api/shelf/library"))).status).toBe(401);
  });

  it("returns the page for the token's workspace", async () => {
    mocks.authenticateShelfRequest.mockResolvedValue(PRINCIPAL);
    mocks.list.mockResolvedValue({ ok: true, value: { items: [], nextOffset: null } });
    const response = await GET(new Request("http://localhost/api/shelf/library?offset=100"));
    expect(mocks.list).toHaveBeenCalledWith(100);
    expect(await response.json()).toEqual({ items: [], nextOffset: null });
  });

  it("treats a bad offset as 0", async () => {
    mocks.authenticateShelfRequest.mockResolvedValue(PRINCIPAL);
    mocks.list.mockResolvedValue({ ok: true, value: { items: [], nextOffset: null } });
    await GET(new Request("http://localhost/api/shelf/library?offset=-4"));
    expect(mocks.list).toHaveBeenCalledWith(0);
  });

  it("maps library errors to the shelf envelope", async () => {
    mocks.authenticateShelfRequest.mockResolvedValue(PRINCIPAL);
    mocks.list.mockResolvedValue({ ok: false, error: "unauthorized" });
    expect((await GET(new Request("http://localhost/api/shelf/library"))).status).toBe(401);
    mocks.list.mockResolvedValue({ ok: false, error: "unavailable" });
    expect((await GET(new Request("http://localhost/api/shelf/library"))).status).toBe(503);
  });
});
