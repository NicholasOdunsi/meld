import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createShelfServerClient: vi.fn(),
  authenticateShelfRequest: vi.fn(),
  setAppleRules: vi.fn(),
}));
vi.mock("@/lib/supabase/shelf-server", () => ({ createShelfServerClient: mocks.createShelfServerClient }));
vi.mock("@/features/inspiration/shelf-auth", () => ({ authenticateShelfRequest: mocks.authenticateShelfRequest }));
vi.mock("@/features/rooms/e2e-gate", () => ({ isRoomFakeEnabled: () => false }));
vi.mock("@/features/inspiration/shelf-taste", () => ({
  createShelfTaste: () => ({ setAppleRules: mocks.setAppleRules }),
  createFakeShelfTaste: () => ({ setAppleRules: mocks.setAppleRules }),
}));

import { PUT } from "./route";

const PRINCIPAL = {
  tokenId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  workspaceId: "33333333-3333-4333-8333-333333333333",
};
const put = (body: unknown) =>
  PUT(new Request("http://localhost/api/shelf/taste/apple-rules", { method: "PUT", body: JSON.stringify(body) }));

describe("PUT /api/shelf/taste/apple-rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createShelfServerClient.mockReturnValue({});
    mocks.authenticateShelfRequest.mockResolvedValue(PRINCIPAL);
  });

  it("toggles Apple rules and returns enabled", async () => {
    mocks.setAppleRules.mockResolvedValue({ ok: true, value: { enabled: false } });
    const response = await put({ enabled: false });
    expect(mocks.setAppleRules).toHaveBeenCalledWith(false);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enabled: false });
  });

  it("404s when there is no profile", async () => {
    mocks.setAppleRules.mockResolvedValue({ ok: false, error: "not_found" });
    expect((await put({ enabled: true })).status).toBe(404);
  });

  it("422s on a bad body", async () => {
    expect((await put({ enabled: true, extra: 1 })).status).toBe(422);
    expect(mocks.setAppleRules).not.toHaveBeenCalled();
  });
});
