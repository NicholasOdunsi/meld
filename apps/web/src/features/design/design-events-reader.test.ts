import { describe, expect, it, vi, beforeEach } from "vitest";

const order = vi.fn();
const eq = vi.fn(() => ({ order }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ from })) }));
vi.mock("@/features/rooms/e2e-gate", () => ({ isRoomFakeEnabled: () => false }));

import { listRoomDesignEvents } from "./design-events-reader";

const ROOM = "11111111-1111-4111-8111-111111111111";
beforeEach(() => { order.mockReset(); eq.mockClear(); select.mockClear(); from.mockClear(); });

describe("listRoomDesignEvents", () => {
  it("maps rows snake→camel", async () => {
    order.mockResolvedValue({
      data: [{
        id: "22222222-2222-4222-8222-222222222222", room_id: ROOM, screen_id: null,
        kind: "generation_started", message_id: null, task_id: null, version_id: null,
        actor: null, created_at: "2026-08-14T10:00:00.000Z",
      }],
      error: null,
    });
    const out = await listRoomDesignEvents(ROOM);
    expect(from).toHaveBeenCalledWith("design_screen_events");
    expect(out).toEqual([{
      id: "22222222-2222-4222-8222-222222222222", roomId: ROOM, screenId: null,
      kind: "generation_started", messageId: null, taskId: null, versionId: null,
      actor: null, createdAt: "2026-08-14T10:00:00.000Z",
    }]);
  });
  it("returns [] on a bad room id", async () => {
    expect(await listRoomDesignEvents("nope")).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });
  it("returns [] on error", async () => {
    order.mockResolvedValue({ data: null, error: { message: "x" } });
    expect(await listRoomDesignEvents(ROOM)).toEqual([]);
  });
});
