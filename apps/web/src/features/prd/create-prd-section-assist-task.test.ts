import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

import { createPrdSectionAssistTask } from "./create-prd-section-assist-task";

const ROOM_ID = "40000000-0000-4000-8000-000000000001";
const CLIENT_REQUEST_ID = "90000000-0000-4000-8000-000000000001";

const sections = [
  {
    field: "executiveSummary" as const,
    label: "Executive summary",
    quotedText: "Reduce checkout friction.",
  },
];

describe("createPrdSectionAssistTask", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createClient.mockResolvedValue({
      rpc: mocks.rpc,
    } as unknown as SupabaseClient);
  });

  it("calls the assist RPC with the scope, instruction, and idempotency key", async () => {
    mocks.rpc.mockResolvedValue({
      data: { taskId: "task-1", requestId: "request-1" },
      error: null,
    });

    await expect(
      createPrdSectionAssistTask({
        roomId: ROOM_ID,
        clientRequestId: CLIENT_REQUEST_ID,
        sections,
        instruction: "Why did we choose this?",
        provider: "codex",
      }),
    ).resolves.toEqual({ taskId: "task-1", requestId: "request-1" });
    expect(mocks.rpc).toHaveBeenCalledWith("create_prd_section_assist_task", {
      target_room_id: ROOM_ID,
      target_sections: sections,
      target_instruction: "Why did we choose this?",
      target_client_request_id: CLIENT_REQUEST_ID,
      target_provider: "codex",
    });
  });

  it("leaves the provider to the caller's stored default when none is given", async () => {
    mocks.rpc.mockResolvedValue({
      data: { taskId: "task-1", requestId: "request-1" },
      error: null,
    });

    await createPrdSectionAssistTask({
      roomId: ROOM_ID,
      clientRequestId: CLIENT_REQUEST_ID,
      sections,
      instruction: "Why did we choose this?",
    });

    expect(mocks.rpc).toHaveBeenCalledWith(
      "create_prd_section_assist_task",
      expect.objectContaining({ target_provider: null }),
    );
  });

  it("does not leak why the RPC refused the request", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "invalid_prd_section_assist_request" },
    });

    await expect(
      createPrdSectionAssistTask({
        roomId: ROOM_ID,
        clientRequestId: CLIENT_REQUEST_ID,
        sections,
        instruction: "Why did we choose this?",
      }),
    ).rejects.toThrow("Could not send this to the Product Agent.");
  });
});
