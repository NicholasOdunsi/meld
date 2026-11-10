import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createShelfServerClient: vi.fn(),
  authenticateShelfRequest: vi.fn(),
  runCompose: vi.fn(),
  take: vi.fn(),
  isRoomFakeEnabled: vi.fn(),
  createFakeShelfTaste: vi.fn(),
  createShelfTaste: vi.fn(),
  fakeComposerCards: vi.fn(),
}));
vi.mock("@/lib/supabase/shelf-server", () => ({ createShelfServerClient: mocks.createShelfServerClient }));
vi.mock("@/features/inspiration/shelf-auth", () => ({ authenticateShelfRequest: mocks.authenticateShelfRequest }));
vi.mock("@/features/rooms/e2e-gate", () => ({ isRoomFakeEnabled: () => mocks.isRoomFakeEnabled() }));
vi.mock("@/features/inspiration/shelf-taste", () => ({
  createShelfTaste: (...args: unknown[]) => mocks.createShelfTaste(...args),
  createFakeShelfTaste: (...args: unknown[]) => mocks.createFakeShelfTaste(...args),
}));
vi.mock("@/features/inspiration/taste/taste-fake", () => ({
  fakeComposerCards: () => mocks.fakeComposerCards(),
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
    mocks.isRoomFakeEnabled.mockReturnValue(false);
    mocks.createShelfTaste.mockReturnValue({});
    mocks.createFakeShelfTaste.mockReturnValue({});
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
    expect(input).toMatchObject({ words: "calm", urls: ["https://example.com"], tile: "density" });
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

  it("returns fake composer cards when room fake is on", async () => {
    mocks.isRoomFakeEnabled.mockReturnValue(true);
    const composerCards = [
      {
        tile: "spacing",
        op: "set",
        value: "comfortable",
        reason: "Brand guide",
        source: { kind: "file", name: "Brand-guide.pdf", locator: "page 3" },
      },
      {
        tile: "density",
        op: "set",
        value: "balanced",
        reason: "Your words",
        source: { kind: "words", name: "Your words", locator: '"a little denser"' },
      },
    ];
    const pending = composerCards.map((card, i) => ({
      id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${i}`,
      tile: card.tile,
      op: card.op,
      value: card.value,
      reason: card.reason,
      evidenceItemIds: [],
      origin: "composer" as const,
      source: card.source,
    }));
    mocks.fakeComposerCards.mockReturnValue(composerCards);
    const addCards = vi.fn().mockResolvedValue({ ok: true, value: { ids: pending.map((p) => p.id) } });
    const get = vi.fn().mockResolvedValue({
      ok: true,
      value: { board: {}, version: 1, pending },
    });
    mocks.createFakeShelfTaste.mockReturnValue({ addCards, get });

    const response = await post({ words: "calm" });
    expect(response.status).toBe(200);
    expect(mocks.runCompose).not.toHaveBeenCalled();
    expect(addCards).toHaveBeenCalled();
    const body = await response.json();
    expect(body.cards).toHaveLength(2);
    expect(body.cards[0].source).toMatchObject({ name: "Brand-guide.pdf", locator: "page 3" });
    expect(body.skipped).toEqual([]);
  });
});
