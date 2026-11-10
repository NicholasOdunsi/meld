import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createShelfServerClient: vi.fn(),
  authenticateShelfRequest: vi.fn(),
  get: vi.fn(),
  isRoomFakeEnabled: vi.fn(),
}));
vi.mock("@/lib/supabase/shelf-server", () => ({ createShelfServerClient: mocks.createShelfServerClient }));
vi.mock("@/features/inspiration/shelf-auth", () => ({ authenticateShelfRequest: mocks.authenticateShelfRequest }));
vi.mock("@/features/rooms/e2e-gate", () => ({ isRoomFakeEnabled: () => mocks.isRoomFakeEnabled() }));
vi.mock("@/features/inspiration/shelf-taste", () => ({
  createShelfTaste: () => ({ get: mocks.get }),
  createFakeShelfTaste: () => ({ get: mocks.get }),
}));

import { GET } from "./route";

const PRINCIPAL = {
  tokenId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  workspaceId: "33333333-3333-4333-8333-333333333333",
};
const get = () => GET(new Request("http://localhost/api/shelf/taste"));

describe("GET /api/shelf/taste", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createShelfServerClient.mockReturnValue({});
    mocks.authenticateShelfRequest.mockResolvedValue(PRINCIPAL);
    mocks.isRoomFakeEnabled.mockReturnValue(false);
  });

  it("returns ready with the snapshot", async () => {
    const snapshot = {
      board: { density: "airy" },
      version: 2,
      pending: [],
    };
    mocks.get.mockResolvedValue({ ok: true, value: snapshot });
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ready",
      ...snapshot,
      composerEnabled: Boolean(process.env.DEEPSEEK_API_KEY),
    });
  });

  it("returns learning when there is no board yet", async () => {
    mocks.get.mockResolvedValue({ ok: true, value: null });
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "learning",
      composerEnabled: Boolean(process.env.DEEPSEEK_API_KEY),
    });
  });

  it("enables the composer in demo fake mode without a DeepSeek key", async () => {
    mocks.isRoomFakeEnabled.mockReturnValue(true);
    mocks.get.mockResolvedValue({ ok: true, value: { board: {}, version: 1, pending: [] } });
    const previous = process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    try {
      const body = await (await get()).json();
      expect(body.composerEnabled).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.DEEPSEEK_API_KEY;
      else process.env.DEEPSEEK_API_KEY = previous;
    }
  });

  it("401s without a valid key and maps unavailable", async () => {
    mocks.authenticateShelfRequest.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
    mocks.authenticateShelfRequest.mockResolvedValue(PRINCIPAL);
    mocks.get.mockResolvedValue({ ok: false, error: "unavailable" });
    expect((await get()).status).toBe(503);
  });
});
