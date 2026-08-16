import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  isRoomFakeEnabled: vi.fn(() => false),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/features/rooms/e2e-gate", () => ({
  isRoomFakeEnabled: mocks.isRoomFakeEnabled,
}));

import { startUserFlow } from "./user-flow-lifecycle";

const roomId = "40000000-0000-4000-8000-000000000004";
const row = {
  room_id: roomId,
  created_by: "10000000-0000-4000-8000-000000000001",
  created_at: "2026-08-11T12:00:00+00:00",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isRoomFakeEnabled.mockReturnValue(false);
});

describe("startUserFlow", () => {
  it("returns one authoritative lifecycle row across retries", async () => {
    const databaseRows: typeof row[] = [];
    const rpc = vi.fn(async () => {
      if (databaseRows.length === 0) databaseRows.push(row);
      return { data: databaseRows[0], error: null };
    });
    mocks.createClient.mockResolvedValue({ rpc });

    const first = await startUserFlow(roomId);
    const retry = await startUserFlow(roomId);

    expect(first).toEqual({
      roomId,
      createdBy: row.created_by,
      createdAt: row.created_at,
    });
    expect(retry).toEqual(first);
    expect(databaseRows).toHaveLength(1);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenLastCalledWith("start_user_flow", {
      target_room_id: roomId,
    });
  });

  it("rejects invalid room ids before opening a database client", async () => {
    await expect(startUserFlow("not-a-room-id")).rejects.toThrow();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("uses a stable user-facing error without exposing database details", async () => {
    mocks.createClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "permission internals" },
      }),
    });

    await expect(startUserFlow(roomId)).rejects.toThrow(
      "We could not start that user flow.",
    );
  });

  it("rejects malformed lifecycle output with the same stable error", async () => {
    mocks.createClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({
        data: { ...row, created_by: "not-a-user-id" },
        error: null,
      }),
    });

    await expect(startUserFlow(roomId)).rejects.toThrow(
      "We could not start that user flow.",
    );
  });
});
