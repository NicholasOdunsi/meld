import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createShelfServerClient: vi.fn(),
  authenticateShelfRequest: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/lib/supabase/shelf-server", () => ({ createShelfServerClient: mocks.createShelfServerClient }));
vi.mock("@/features/inspiration/shelf-auth", () => ({ authenticateShelfRequest: mocks.authenticateShelfRequest }));

import { GET } from "./route";

const PRINCIPAL = {
  tokenId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  workspaceId: "33333333-3333-4333-8333-333333333333",
};
const ROOM = "44444444-4444-4444-8444-444444444444";

describe("GET /api/shelf/rooms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createShelfServerClient.mockReturnValue({ rpc: mocks.rpc });
  });

  it("401s without a valid token", async () => {
    mocks.authenticateShelfRequest.mockResolvedValue(null);
    expect((await GET(new Request("http://localhost/api/shelf/rooms"))).status).toBe(401);
  });

  it("returns room names only, for the token's user and workspace", async () => {
    mocks.authenticateShelfRequest.mockResolvedValue(PRINCIPAL);
    mocks.rpc.mockResolvedValue({ data: [{ room_id: ROOM, room_name: "Login", project_name: "App" }], error: null });
    const response = await GET(new Request("http://localhost/api/shelf/rooms"));
    expect(mocks.rpc).toHaveBeenCalledWith("list_capture_rooms", {
      actor_user_id: PRINCIPAL.userId,
      target_workspace_id: PRINCIPAL.workspaceId,
    });
    expect(await response.json()).toEqual([{ roomId: ROOM, roomName: "Login", projectName: "App" }]);
  });

  it("503s when the room query fails", async () => {
    mocks.authenticateShelfRequest.mockResolvedValue(PRINCIPAL);
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect((await GET(new Request("http://localhost/api/shelf/rooms"))).status).toBe(503);
  });
});
