import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ rpc })),
}));

import { dismissProposal, dismissRoomAttention, getWorkspaceActivity, markRoomViewed } from "./actions";

beforeEach(() => rpc.mockReset());

describe("activity actions", () => {
  it("getWorkspaceActivity reads through the RPC", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await expect(getWorkspaceActivity("ws-1")).resolves.toEqual([]);
    expect(rpc).toHaveBeenCalledWith("list_workspace_activity", { target_workspace_id: "ws-1" });
  });
  it.each([
    ["markRoomViewed", markRoomViewed, "mark_room_viewed", { target_room_id: "r-1" }],
    ["dismissRoomAttention", dismissRoomAttention, "dismiss_room_attention", { target_room_id: "r-1" }],
    ["dismissProposal", dismissProposal, "dismiss_message_proposal", { target_message_id: "r-1" }],
  ])("%s calls its RPC", async (_name, action, fn, args) => {
    rpc.mockResolvedValue({ data: null, error: null });
    await action("r-1");
    expect(rpc).toHaveBeenCalledWith(fn, args);
  });
  it("write actions throw a friendly error", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "nope" } });
    await expect(markRoomViewed("r-1")).rejects.toThrow("We could not update that. Try again.");
  });
});
