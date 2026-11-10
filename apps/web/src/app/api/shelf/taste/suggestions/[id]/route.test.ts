import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createShelfServerClient: vi.fn(),
  authenticateShelfRequest: vi.fn(),
  decide: vi.fn(),
}));
vi.mock("@/lib/supabase/shelf-server", () => ({ createShelfServerClient: mocks.createShelfServerClient }));
vi.mock("@/features/inspiration/shelf-auth", () => ({ authenticateShelfRequest: mocks.authenticateShelfRequest }));
vi.mock("@/features/rooms/e2e-gate", () => ({ isRoomFakeEnabled: () => false }));
vi.mock("@/features/inspiration/shelf-taste", () => ({
  createShelfTaste: () => ({ decide: mocks.decide }),
  createFakeShelfTaste: () => ({ decide: mocks.decide }),
}));

import { POST } from "./route";

const PRINCIPAL = {
  tokenId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  workspaceId: "33333333-3333-4333-8333-333333333333",
};
const ID = "44444444-4444-4444-8444-444444444444";
const post = (body: unknown, id = ID) =>
  POST(new Request(`http://localhost/api/shelf/taste/suggestions/${id}`, { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id }),
  });

describe("POST /api/shelf/taste/suggestions/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createShelfServerClient.mockReturnValue({});
    mocks.authenticateShelfRequest.mockResolvedValue(PRINCIPAL);
  });

  it("keeps a suggestion and returns the status", async () => {
    mocks.decide.mockResolvedValue({ ok: true, value: { status: "kept" } });
    const response = await post({ decision: "kept", expectedVersion: 2 });
    expect(mocks.decide).toHaveBeenCalledWith({ suggestionId: ID, decision: "kept", expectedVersion: 2 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "kept" });
  });

  it("404s when the suggestion is gone", async () => {
    mocks.decide.mockResolvedValue({ ok: false, error: "not_found" });
    expect((await post({ decision: "rejected", expectedVersion: 2 })).status).toBe(404);
  });

  it("422s on a bad body or id", async () => {
    expect((await post({ decision: "maybe", expectedVersion: 0 })).status).toBe(422);
    expect((await post({ decision: "kept", expectedVersion: 0 }, "nope")).status).toBe(422);
    expect(mocks.decide).not.toHaveBeenCalled();
  });
});
