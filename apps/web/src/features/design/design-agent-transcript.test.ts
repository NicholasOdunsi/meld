import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { listDesignAgentTurns } from "./design-agent-transcript";

const roomId = "40000000-0000-4000-8000-000000000004";
const taskId = "70000000-0000-4000-8000-000000000007";
const screenId = "50000000-0000-4000-8000-000000000005";
const userId = "10000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listDesignAgentTurns", () => {
  it("maps the RPC rows into camelCase turns", async () => {
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      expect(name).toBe("list_design_agent_turns");
      expect(args).toEqual({ target_room_id: roomId });
      return {
        data: [
          {
            task_id: taskId,
            screen_id: screenId,
            screen_name: "Sign in",
            user_prompt: "A clean sign in screen",
            initiated_by: userId,
            task_status: "completed",
            screen_state: "built",
            current_version_id: "80000000-0000-4000-8000-000000000008",
            created_at: "2026-08-17T00:00:00.000Z",
          },
        ],
        error: null,
      };
    });
    mocks.createClient.mockResolvedValue({ rpc });

    await expect(listDesignAgentTurns(roomId)).resolves.toEqual([
      {
        taskId,
        screenId,
        screenName: "Sign in",
        userPrompt: "A clean sign in screen",
        initiatedBy: userId,
        taskStatus: "completed",
        screenState: "built",
        currentVersionId: "80000000-0000-4000-8000-000000000008",
        createdAt: "2026-08-17T00:00:00.000Z",
      },
    ]);
  });

  it("returns an empty list on an invalid room id without calling the RPC", async () => {
    await expect(listDesignAgentTurns("not-a-uuid")).resolves.toEqual([]);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("returns an empty list when the RPC errors", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "nope" } }));
    mocks.createClient.mockResolvedValue({ rpc });
    await expect(listDesignAgentTurns(roomId)).resolves.toEqual([]);
  });
});
