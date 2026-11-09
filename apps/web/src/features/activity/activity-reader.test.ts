import { describe, expect, it, vi } from "vitest";
import { readWorkspaceActivity, type ActivityRpcClient } from "./activity-reader";

const row = {
  room_id: "a4000000-0000-4000-8000-000000000001",
  project_id: "a7000000-0000-4000-8000-000000000001",
  room_name: "Inbox screen",
  state: "working",
  reason: null,
  task_kind: "design_screen_generate",
  task_status: "running",
  provider: "claude",
  proposal_kind: null,
  proposal_message_id: null,
  occurred_at: null,
  last_activity_at: "2026-11-09T10:00:00+00:00",
};

function client(result: { data: unknown; error: { message: string } | null }): ActivityRpcClient {
  return { rpc: vi.fn().mockResolvedValue(result) };
}

describe("readWorkspaceActivity", () => {
  it("maps rows to RoomActivity", async () => {
    const supabase = client({ data: [row], error: null });
    const result = await readWorkspaceActivity(supabase, "ws-1");
    expect(supabase.rpc).toHaveBeenCalledWith("list_workspace_activity", { target_workspace_id: "ws-1" });
    expect(result).toEqual([
      expect.objectContaining({ roomId: row.room_id, state: "working", taskStatus: "running" }),
    ]);
  });
  it("drops rows that fail validation instead of failing the whole list", async () => {
    const result = await readWorkspaceActivity(client({ data: [row, { ...row, state: "busy" }], error: null }), "ws-1");
    expect(result).toHaveLength(1);
  });
  it("throws a friendly error when the RPC fails", async () => {
    await expect(readWorkspaceActivity(client({ data: null, error: { message: "boom" } }), "ws-1"))
      .rejects.toThrow("We could not load what's happening in your projects.");
  });
});
