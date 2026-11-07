import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  isRoomFakeEnabled: vi.fn(() => false),
  sortInspirationBacklog: vi.fn(async () => ({ sorted: 0, failed: 0 })),
  createShelfServerClient: vi.fn(() => ({})),
}));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/features/rooms/e2e-gate", () => ({ isRoomFakeEnabled: mocks.isRoomFakeEnabled }));
vi.mock("./sort-backlog", () => ({ sortInspirationBacklog: mocks.sortInspirationBacklog }));
vi.mock("@/lib/supabase/shelf-server", () => ({ createShelfServerClient: mocks.createShelfServerClient }));

import { scheduleInspirationSort } from "./schedule-inspiration-sort";

const WS = "11111111-1111-4111-8111-111111111111";

describe("scheduleInspirationSort", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DEEPSEEK_API_KEY", "sk-test");
    vi.stubEnv("DEEPSEEK_VISION_MODEL", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("runs the backlog after the response with the default model", async () => {
    scheduleInspirationSort(WS);
    expect(mocks.after).toHaveBeenCalledTimes(1);
    await mocks.after.mock.calls[0][0]();
    expect(mocks.sortInspirationBacklog).toHaveBeenCalledWith(WS, expect.objectContaining({
      labeler: expect.objectContaining({ model: "deepseek-flash" }),
    }));
  });

  it("does nothing without a key or in E2E fake mode", () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    scheduleInspirationSort(WS);
    vi.stubEnv("DEEPSEEK_API_KEY", "sk-test");
    mocks.isRoomFakeEnabled.mockReturnValueOnce(true);
    scheduleInspirationSort(WS);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("swallows a failed run", async () => {
    mocks.sortInspirationBacklog.mockRejectedValueOnce(new Error("boom"));
    scheduleInspirationSort(WS);
    await expect(mocks.after.mock.calls[0][0]()).resolves.toBeUndefined();
  });
});
