import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createShelfServerClient: vi.fn(), authenticateShelfRequest: vi.fn(), addToRoom: vi.fn() }));
vi.mock("@/lib/supabase/shelf-server", () => ({ createShelfServerClient: mocks.createShelfServerClient }));
vi.mock("@/features/inspiration/shelf-auth", () => ({ authenticateShelfRequest: mocks.authenticateShelfRequest }));
vi.mock("@/features/rooms/e2e-gate", () => ({ isRoomFakeEnabled: () => false }));
vi.mock("@/features/inspiration/shelf-library", () => ({
  createShelfLibrary: () => ({ addToRoom: mocks.addToRoom }),
  createFakeShelfLibrary: () => ({ addToRoom: mocks.addToRoom }),
}));

import { POST } from "./route";

const ID = "44444444-4444-4444-8444-444444444444";
const ROOM = "55555555-5555-4555-8555-555555555555";
const post = (body: unknown) => POST(new Request("http://localhost/api/shelf/library/add-to-room", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/shelf/library/add-to-room", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createShelfServerClient.mockReturnValue({});
    mocks.authenticateShelfRequest.mockResolvedValue({ tokenId: ID, userId: ID, workspaceId: ID });
  });

  it("links the ids to the room", async () => {
    mocks.addToRoom.mockResolvedValue({ ok: true, value: { count: 2 } });
    const response = await post({ ids: [ID], roomId: ROOM });
    expect(mocks.addToRoom).toHaveBeenCalledWith([ID], ROOM);
    expect(await response.json()).toEqual({ count: 2 });
  });

  it("422s without a room", async () => {
    expect((await post({ ids: [ID] })).status).toBe(422);
  });

  it("404s for a room outside the workspace", async () => {
    mocks.addToRoom.mockResolvedValue({ ok: false, error: "not_found" });
    expect((await post({ ids: [ID], roomId: ROOM })).status).toBe(404);
  });
});
