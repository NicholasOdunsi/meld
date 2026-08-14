import { describe, expect, it, vi, beforeEach } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ rpc })),
}));
vi.mock("@/features/rooms/e2e-gate", () => ({ isRoomFakeEnabled: () => false }));

import { seedDesignScreensFromFlow } from "./seed-design-screens";

const ROOM = "11111111-1111-4111-8111-111111111111";
const SCREEN = "22222222-2222-4222-8222-222222222222";

beforeEach(() => { rpc.mockReset(); });

describe("seedDesignScreensFromFlow", () => {
  it("returns [] and skips the RPC when there are no seeds", async () => {
    expect(await seedDesignScreensFromFlow({ roomId: ROOM, seeds: [] })).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps inserted rows to CanvasScreen", async () => {
    rpc.mockResolvedValue({
      data: [{ id: SCREEN, name: "Pick plan", flow_node_id: "pick_plan", canvas_x: 0, canvas_y: 1200, state: "empty" }],
      error: null,
    });
    const out = await seedDesignScreensFromFlow({
      roomId: ROOM,
      seeds: [{ nodeId: "pick_plan", name: "Pick plan", x: 0, y: 1200 }],
    });
    expect(rpc).toHaveBeenCalledWith("seed_design_screens_from_flow", {
      target_room_id: ROOM,
      nodes: [{ node_id: "pick_plan", name: "Pick plan", x: 0, y: 1200 }],
    });
    expect(out).toEqual([
      { id: SCREEN, name: "Pick plan", canvasX: 0, canvasY: 1200, flowNodeId: "pick_plan", state: "empty", preview: null },
    ]);
  });

  it("returns [] on RPC error", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "denied" } });
    expect(await seedDesignScreensFromFlow({ roomId: ROOM, seeds: [{ nodeId: "a", name: "A", x: 0, y: 0 }] })).toEqual([]);
  });
});
