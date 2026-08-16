import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

import { createRoomReplyTask } from "./create-room-reply-task";

const SOURCE_MESSAGE_ID = "10000000-0000-4000-8000-000000000001";
const TASK_ID = "70000000-0000-4000-8000-000000000007";

const TASK_ROW = {
  id: TASK_ID,
  initiatingUserId: "80000000-0000-4000-8000-000000000008",
  workspaceId: "90000000-0000-4000-8000-000000000009",
  roomId: "20000000-0000-4000-8000-000000000002",
  deviceId: "30000000-0000-4000-8000-000000000003",
  provider: "claude",
  kind: "room_reply",
  status: "queued",
  contextRevision: 0,
  createdAt: "2026-07-28T12:00:00.000Z",
  updatedAt: "2026-07-28T12:00:00.000Z",
};

describe("createRoomReplyTask wrapper", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
  });

  it("authenticates a request-scoped client and forwards the explicit provider", async () => {
    mocks.rpc.mockResolvedValue({ data: TASK_ROW, error: null });

    const task = await createRoomReplyTask({
      sourceMessageId: SOURCE_MESSAGE_ID,
      provider: "claude",
    });

    expect(mocks.createClient).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("create_room_reply_task", {
      target_source_message_id: SOURCE_MESSAGE_ID,
      target_provider: "claude",
      target_model: null,
      target_agent_kind: "product",
      target_research_scope: "room",
    });
    expect(task.id).toBe(TASK_ID);
    expect(task.provider).toBe("claude");
  });

  it("passes a null provider when no override is supplied", async () => {
    mocks.rpc.mockResolvedValue({
      data: { ...TASK_ROW, provider: "codex" },
      error: null,
    });

    await createRoomReplyTask({ sourceMessageId: SOURCE_MESSAGE_ID });

    expect(mocks.rpc).toHaveBeenCalledWith("create_room_reply_task", {
      target_source_message_id: SOURCE_MESSAGE_ID,
      target_provider: null,
      target_model: null,
      target_agent_kind: "product",
      target_research_scope: "room",
    });
  });

  it("surfaces the generic room-reply error when the RPC rejects", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "invalid_room_reply_request" },
    });

    await expect(
      createRoomReplyTask({ sourceMessageId: SOURCE_MESSAGE_ID }),
    ).rejects.toThrow("We could not ask the agent to reply.");
  });
});
