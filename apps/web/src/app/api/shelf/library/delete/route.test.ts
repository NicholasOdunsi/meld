import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createShelfServerClient: vi.fn(), authenticateShelfRequest: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/supabase/shelf-server", () => ({ createShelfServerClient: mocks.createShelfServerClient }));
vi.mock("@/features/inspiration/shelf-auth", () => ({ authenticateShelfRequest: mocks.authenticateShelfRequest }));
vi.mock("@/features/rooms/e2e-gate", () => ({ isRoomFakeEnabled: () => false }));
vi.mock("@/features/inspiration/shelf-library", () => ({
  createShelfLibrary: () => ({ remove: mocks.remove }),
  createFakeShelfLibrary: () => ({ remove: mocks.remove }),
}));

import { POST } from "./route";

const ID = "44444444-4444-4444-8444-444444444444";
const post = (body: unknown) => POST(new Request("http://localhost/api/shelf/library/delete", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/shelf/library/delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createShelfServerClient.mockReturnValue({});
    mocks.authenticateShelfRequest.mockResolvedValue({ tokenId: ID, userId: ID, workspaceId: ID });
  });

  it("deletes the ids", async () => {
    mocks.remove.mockResolvedValue({ ok: true, value: { count: 1 } });
    const response = await post({ ids: [ID] });
    expect(mocks.remove).toHaveBeenCalledWith([ID]);
    expect(await response.json()).toEqual({ count: 1 });
  });

  it("422s on an empty list", async () => {
    expect((await post({ ids: [] })).status).toBe(422);
  });

  it("401s when the item belongs elsewhere", async () => {
    mocks.remove.mockResolvedValue({ ok: false, error: "unauthorized" });
    expect((await post({ ids: [ID] })).status).toBe(401);
  });
});
