import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createShelfServerClient: vi.fn(),
  authenticateShelfRequest: vi.fn(),
  runCompose: vi.fn(),
  take: vi.fn(),
}));
vi.mock("@/lib/supabase/shelf-server", () => ({ createShelfServerClient: mocks.createShelfServerClient }));
vi.mock("@/features/inspiration/shelf-auth", () => ({ authenticateShelfRequest: mocks.authenticateShelfRequest }));
vi.mock("@/features/rooms/e2e-gate", () => ({ isRoomFakeEnabled: () => false }));
vi.mock("@/features/inspiration/shelf-taste", () => ({
  createShelfTaste: () => ({}),
  createFakeShelfTaste: () => ({}),
}));
vi.mock("@/features/inspiration/taste/compose/run-compose", () => ({
  runCompose: mocks.runCompose,
  COMPOSE_LIMITS: { words: 4000, urls: 3, files: 6, library: 3 },
}));
vi.mock("@/features/inspiration/taste/compose/compose-rate-limit", () => ({
  composeLimiter: { take: mocks.take },
}));

import { POST } from "./route";

const PRINCIPAL = {
  tokenId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  workspaceId: "33333333-3333-4333-8333-333333333333",
};
function post(fields: Record<string, string | Blob>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return POST(new Request("http://localhost/api/shelf/taste/compose", { method: "POST", body: form }));
}

describe("POST /api/shelf/taste/compose", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createShelfServerClient.mockReturnValue({});
    mocks.authenticateShelfRequest.mockResolvedValue(PRINCIPAL);
    mocks.take.mockReturnValue(true);
  });

  it("passes words, urls, files, tile and replyTo to runCompose", async () => {
    mocks.runCompose.mockResolvedValue({ ok: true, cards: [], skipped: [] });
    const response = await post({
      words: "calm",
      urls: JSON.stringify(["https://example.com"]),
      tile: "density",
      replyTo: JSON.stringify(["44444444-4444-4444-8444-444444444444"]),
      file: new File([new Uint8Array([1, 2])], "a.txt", { type: "text/plain" }),
    });
    expect(response.status).toBe(200);
    const input = mocks.runCompose.mock.calls[0][0];
    expect(input).toMatchObject({ words: "calm", urls: ["https://example.com"], tile: "density", preset: null });
    expect(input.files[0]).toMatchObject({ name: "a.txt", mimeType: "text/plain" });
  });

  it("429s when over the limit and 422s on bad fields", async () => {
    mocks.take.mockReturnValue(false);
    expect((await post({ words: "x" })).status).toBe(429);
    mocks.take.mockReturnValue(true);
    expect((await post({ words: "x", tile: "mood" })).status).toBe(422);
    expect((await post({ words: "x", urls: "not json" })).status).toBe(422);
    expect(mocks.runCompose).not.toHaveBeenCalled();
  });

  it("maps runCompose errors to shelf errors", async () => {
    mocks.runCompose.mockResolvedValue({ ok: false, error: "unavailable" });
    expect((await post({ words: "x" })).status).toBe(503);
    mocks.runCompose.mockResolvedValue({ ok: false, error: "not_found" });
    expect((await post({ words: "x" })).status).toBe(404);
  });

  it("401s without a valid key", async () => {
    mocks.authenticateShelfRequest.mockResolvedValue(null);
    expect((await post({ words: "x" })).status).toBe(401);
  });
});
