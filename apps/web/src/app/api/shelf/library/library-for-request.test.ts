import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createShelfServerClient: vi.fn(),
  authenticateShelfRequest: vi.fn(),
  createShelfLibrary: vi.fn(),
  createFakeShelfLibrary: vi.fn(),
  isRoomFakeEnabled: vi.fn(() => false),
}));
vi.mock("@/lib/supabase/shelf-server", () => ({ createShelfServerClient: mocks.createShelfServerClient }));
vi.mock("@/features/inspiration/shelf-auth", () => ({ authenticateShelfRequest: mocks.authenticateShelfRequest }));
vi.mock("@/features/rooms/e2e-gate", () => ({ isRoomFakeEnabled: mocks.isRoomFakeEnabled }));
vi.mock("@/features/inspiration/shelf-library", () => ({
  createShelfLibrary: mocks.createShelfLibrary,
  createFakeShelfLibrary: mocks.createFakeShelfLibrary,
}));

import { libraryForRequest } from "./library-for-request";

const PRINCIPAL = {
  tokenId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  workspaceId: "33333333-3333-4333-8333-333333333333",
};

describe("libraryForRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createShelfServerClient.mockReturnValue({});
    mocks.isRoomFakeEnabled.mockReturnValue(false);
  });

  it("401s without a valid token", async () => {
    mocks.authenticateShelfRequest.mockResolvedValue(null);
    const resolved = await libraryForRequest(new Request("http://localhost/api/shelf/library"));
    expect("response" in resolved).toBe(true);
    if ("response" in resolved) expect(resolved.response.status).toBe(401);
  });

  it("uses the fake library in fake mode", async () => {
    mocks.isRoomFakeEnabled.mockReturnValue(true);
    mocks.authenticateShelfRequest.mockResolvedValue(PRINCIPAL);
    const fake = { list: vi.fn() };
    mocks.createFakeShelfLibrary.mockReturnValue(fake);
    const resolved = await libraryForRequest(new Request("http://localhost/api/shelf/library"));
    expect(mocks.createFakeShelfLibrary).toHaveBeenCalledWith(PRINCIPAL);
    expect(mocks.createShelfLibrary).not.toHaveBeenCalled();
    expect(resolved).toEqual({ library: fake });
  });
});
