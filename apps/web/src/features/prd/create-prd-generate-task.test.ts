import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

import { createPrdGenerateTask } from "./create-prd-generate-task";

const ROOM_ID = "40000000-0000-4000-8000-000000000001";

describe("createPrdGenerateTask", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createClient.mockResolvedValue({
      rpc: mocks.rpc,
    } as unknown as SupabaseClient);
  });

  it("calls the authenticated PRD task RPC with the requested provider", async () => {
    mocks.rpc.mockResolvedValue({
      data: { id: "task-1", status: "queued" },
      error: null,
    });

    await expect(
      createPrdGenerateTask({ roomId: ROOM_ID, provider: "codex" }),
    ).resolves.toEqual({ id: "task-1", status: "queued" });
    expect(mocks.rpc).toHaveBeenCalledWith("create_prd_generate_task", {
      target_room_id: ROOM_ID,
      target_provider: "codex",
    });
  });

  it("does not leak RPC errors", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "private database detail" },
    });

    await expect(
      createPrdGenerateTask({ roomId: ROOM_ID }),
    ).rejects.toThrow("Could not start PRD generation.");
  });
});
