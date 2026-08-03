import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDiscoveryBackend: vi.fn(),
  getRoomPrdHistory: vi.fn(),
}));

vi.mock("@/features/discovery/backend", () => ({
  getDiscoveryBackend: mocks.getDiscoveryBackend,
}));

import { getRoomPrdHistory } from "./queries";

const ROOM_ID = "40000000-0000-4000-8000-000000000001";

describe("getRoomPrdHistory", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getDiscoveryBackend.mockResolvedValue({
      getRoomPrdHistory: mocks.getRoomPrdHistory,
    });
  });

  it("rejects unknown input keys before dispatching to the backend", async () => {
    const call = getRoomPrdHistory as (input: unknown) => ReturnType<typeof getRoomPrdHistory>;

    await expect(
      call({ roomId: ROOM_ID, unexpected: true }),
    ).rejects.toThrow();

    expect(mocks.getDiscoveryBackend).not.toHaveBeenCalled();
    expect(mocks.getRoomPrdHistory).not.toHaveBeenCalled();
  });

  it("loads validated history through the shared discovery backend", async () => {
    mocks.getRoomPrdHistory.mockResolvedValue([]);

    await expect(getRoomPrdHistory({ roomId: ROOM_ID })).resolves.toEqual([]);
    expect(mocks.getRoomPrdHistory).toHaveBeenCalledWith({ roomId: ROOM_ID });
  });
});
