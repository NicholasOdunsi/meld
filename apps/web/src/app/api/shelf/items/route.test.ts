import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createShelfServerClient: vi.fn(),
  authenticateShelfRequest: vi.fn(),
  saveInspirationItem: vi.fn(),
  createInspirationRepository: vi.fn(),
  createInspirationStorage: vi.fn(),
}));
const schedule = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/shelf-server", () => ({ createShelfServerClient: mocks.createShelfServerClient }));
vi.mock("@/features/inspiration/shelf-auth", () => ({ authenticateShelfRequest: mocks.authenticateShelfRequest }));
vi.mock("@/features/inspiration/save-inspiration-item", () => ({ saveInspirationItem: mocks.saveInspirationItem }));
vi.mock("@/features/inspiration/inspiration-repository", () => ({ createInspirationRepository: mocks.createInspirationRepository }));
vi.mock("@/features/inspiration/inspiration-storage", () => ({ createInspirationStorage: mocks.createInspirationStorage }));
vi.mock("@/features/inspiration/sorting/schedule-inspiration-sort", () => ({ scheduleInspirationSort: schedule }));

import { POST } from "./route";

const PRINCIPAL = {
  tokenId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  workspaceId: "33333333-3333-4333-8333-333333333333",
};
const ROOM = "44444444-4444-4444-8444-444444444444";
const ITEM = "55555555-5555-4555-8555-555555555555";

function upload(fields: Record<string, string | Blob> = {}) {
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" }), "image.png");
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  return new Request("http://localhost/api/shelf/items", { method: "POST", body: form });
}

describe("POST /api/shelf/items", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    schedule.mockClear();
    mocks.createShelfServerClient.mockReturnValue({});
    mocks.authenticateShelfRequest.mockResolvedValue(PRINCIPAL);
    mocks.createInspirationRepository.mockReturnValue("repository");
    mocks.createInspirationStorage.mockReturnValue("storage");
    mocks.saveInspirationItem.mockResolvedValue({ ok: true, itemId: ITEM, duplicate: false, roomLinked: true });
  });

  it("401s without a valid token and never reads the body", async () => {
    mocks.authenticateShelfRequest.mockResolvedValue(null);
    expect((await POST(upload())).status).toBe(401);
    expect(mocks.saveInspirationItem).not.toHaveBeenCalled();
  });

  it("saves through the one write path as the token's user, channel shelf", async () => {
    const response = await POST(upload({ note: " nice ", sourceUrl: "https://pinterest.com/pin/1", roomId: ROOM }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ itemId: ITEM, duplicate: false, roomLinked: true });
    expect(mocks.createInspirationRepository).toHaveBeenCalledWith({}, { kind: "capture", userId: PRINCIPAL.userId });
    expect(mocks.saveInspirationItem).toHaveBeenCalledWith(
      {
        workspaceId: PRINCIPAL.workspaceId,
        bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
        note: "nice",
        sourceUrl: "https://pinterest.com/pin/1",
        roomId: ROOM,
        channel: "shelf",
      },
      { repository: "repository", storage: "storage" },
    );
    expect(schedule).toHaveBeenCalledWith(PRINCIPAL.workspaceId);
  });

  it("answers 200 for a duplicate", async () => {
    mocks.saveInspirationItem.mockResolvedValue({ ok: true, itemId: ITEM, duplicate: true, roomLinked: false });
    expect((await POST(upload())).status).toBe(200);
    expect(schedule).not.toHaveBeenCalled();
  });

  it("drops a junk roomId and a non-web sourceUrl instead of failing", async () => {
    await POST(upload({ roomId: "not-a-uuid", sourceUrl: "javascript:alert(1)" }));
    expect(mocks.saveInspirationItem).toHaveBeenCalledWith(
      expect.objectContaining({ roomId: null, sourceUrl: null }),
      expect.anything(),
    );
  });

  it.each([
    ["too_large", 413],
    ["unsupported_type", 415],
    ["invalid_image", 422],
    ["unavailable", 503],
  ] as const)("maps %s to %i", async (error, status) => {
    mocks.saveInspirationItem.mockResolvedValue({ ok: false, error });
    expect((await POST(upload())).status).toBe(status);
  });

  it("422s when there is no file", async () => {
    const form = new FormData();
    form.set("note", "x");
    const response = await POST(new Request("http://localhost/api/shelf/items", { method: "POST", body: form }));
    expect(response.status).toBe(422);
  });
});
