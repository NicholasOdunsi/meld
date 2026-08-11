import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRoomBackend: vi.fn(),
  getRoomPrdHistory: vi.fn(),
}));

vi.mock("@/features/rooms/backend", () => ({
  getRoomBackend: mocks.getRoomBackend,
}));

import { getRoomPrdHistory } from "./queries";

const ROOM_ID = "40000000-0000-4000-8000-000000000001";

describe("getRoomPrdHistory", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getRoomBackend.mockResolvedValue({
      getRoomPrdHistory: mocks.getRoomPrdHistory,
    });
  });

  it("rejects unknown input keys before dispatching to the backend", async () => {
    const call = getRoomPrdHistory as (input: unknown) => ReturnType<typeof getRoomPrdHistory>;

    await expect(
      call({ roomId: ROOM_ID, unexpected: true }),
    ).rejects.toThrow();

    expect(mocks.getRoomBackend).not.toHaveBeenCalled();
    expect(mocks.getRoomPrdHistory).not.toHaveBeenCalled();
  });

  it("loads validated history through the shared room backend", async () => {
    mocks.getRoomPrdHistory.mockResolvedValue([]);

    await expect(getRoomPrdHistory({ roomId: ROOM_ID })).resolves.toEqual([]);
    expect(mocks.getRoomPrdHistory).toHaveBeenCalledWith({ roomId: ROOM_ID });
  });
});
