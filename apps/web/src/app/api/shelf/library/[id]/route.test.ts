import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createShelfServerClient: vi.fn(),
  authenticateShelfRequest: vi.fn(),
  updateNote: vi.fn(),
}));
vi.mock("@/lib/supabase/shelf-server", () => ({ createShelfServerClient: mocks.createShelfServerClient }));
vi.mock("@/features/inspiration/shelf-auth", () => ({ authenticateShelfRequest: mocks.authenticateShelfRequest }));
vi.mock("@/features/rooms/e2e-gate", () => ({ isRoomFakeEnabled: () => false }));
vi.mock("@/features/inspiration/shelf-library", () => ({
  createShelfLibrary: () => ({ updateNote: mocks.updateNote }),
  createFakeShelfLibrary: () => ({ updateNote: mocks.updateNote }),
}));

import { PATCH } from "./route";

const PRINCIPAL = {
  tokenId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  workspaceId: "33333333-3333-4333-8333-333333333333",
};
const ID = "44444444-4444-4444-8444-444444444444";
const patch = (body: unknown, id = ID) =>
  PATCH(new Request(`http://localhost/api/shelf/library/${id}`, { method: "PATCH", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id }),
  });

describe("PATCH /api/shelf/library/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createShelfServerClient.mockReturnValue({});
    mocks.authenticateShelfRequest.mockResolvedValue(PRINCIPAL);
  });

  it("saves the note", async () => {
    mocks.updateNote.mockResolvedValue({ ok: true, value: { id: ID, note: "fresh" } });
    const response = await patch({ note: "fresh" });
    expect(mocks.updateNote).toHaveBeenCalledWith(ID, "fresh");
    expect(response.status).toBe(200);
  });

  it("422s on a too-long note or a bad id", async () => {
    expect((await patch({ note: "a".repeat(501) })).status).toBe(422);
    expect((await patch({ note: "x" }, "nope")).status).toBe(422);
    expect(mocks.updateNote).not.toHaveBeenCalled();
  });

  it("404s when the image is gone", async () => {
    mocks.updateNote.mockResolvedValue({ ok: false, error: "not_found" });
    expect((await patch({ note: null })).status).toBe(404);
  });
});
