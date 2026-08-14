import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  isRoomFakeEnabled: vi.fn(() => false),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/features/rooms/e2e-gate", () => ({
  isRoomFakeEnabled: mocks.isRoomFakeEnabled,
}));

import { readRoomActionLinks } from "./action-links-reader";

const ROOM_ID = "20000000-0000-4000-8000-000000000002";
const SCREEN_A_ID = "a0000000-0000-4000-8000-00000000000a";
const SCREEN_B_ID = "b0000000-0000-4000-8000-00000000000b";
const GHOST_SCREEN_ID = "d0000000-0000-4000-8000-00000000000d";

function withRows(rows: unknown, error: unknown = null) {
  const linkQuery = {
    select: vi.fn(),
    in: vi.fn(),
  };
  linkQuery.select.mockReturnValue(linkQuery);
  linkQuery.in.mockResolvedValue({ data: rows, error });

  const from = vi.fn(() => linkQuery);
  mocks.createClient.mockResolvedValue({ from });

  return { from, linkQuery };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isRoomFakeEnabled.mockReturnValue(false);
});

describe("readRoomActionLinks", () => {
  it("returns an empty map without querying when there are no live screens", async () => {
    mocks.createClient.mockResolvedValue({ from: vi.fn() });

    const result = await readRoomActionLinks(ROOM_ID, []);

    expect(result.size).toBe(0);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("returns an empty map without querying supabase in fake mode", async () => {
    mocks.isRoomFakeEnabled.mockReturnValue(true);

    const result = await readRoomActionLinks(ROOM_ID, [SCREEN_A_ID]);

    expect(result.size).toBe(0);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("rejects an invalid room id without querying", async () => {
    const result = await readRoomActionLinks("not-a-uuid", [SCREEN_A_ID]);

    expect(result.size).toBe(0);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("builds a per-screen action->target map scoped to the live screen ids", async () => {
    const { linkQuery } = withRows([
      { screen_id: SCREEN_A_ID, action_id: "go", target_screen_id: SCREEN_B_ID },
    ]);

    const result = await readRoomActionLinks(ROOM_ID, [SCREEN_A_ID, SCREEN_B_ID]);

    expect(result.get(SCREEN_A_ID)).toEqual(new Map([["go", SCREEN_B_ID]]));
    expect(linkQuery.in).toHaveBeenCalledWith("screen_id", [
      SCREEN_A_ID,
      SCREEN_B_ID,
    ]);
  });

  it("drops a link whose target screen is not among the live screen ids", async () => {
    withRows([
      {
        screen_id: SCREEN_A_ID,
        action_id: "go",
        target_screen_id: GHOST_SCREEN_ID,
      },
    ]);

    const result = await readRoomActionLinks(ROOM_ID, [SCREEN_A_ID, SCREEN_B_ID]);

    expect(result.has(SCREEN_A_ID)).toBe(false);
  });

  it("logs and returns an empty map when the query fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const queryError = { message: "permission denied" };
    withRows(null, queryError);

    const result = await readRoomActionLinks(ROOM_ID, [SCREEN_A_ID]);

    expect(result.size).toBe(0);
    expect(error).toHaveBeenCalledWith("room action links read failed", queryError);
  });

  it("logs and returns an empty map when the response fails validation", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    withRows([{ screen_id: SCREEN_A_ID, action_id: "go" }]);

    const result = await readRoomActionLinks(ROOM_ID, [SCREEN_A_ID]);

    expect(result.size).toBe(0);
    expect(error).toHaveBeenCalledWith(
      "room action links response invalid",
      expect.anything(),
    );
  });
});
