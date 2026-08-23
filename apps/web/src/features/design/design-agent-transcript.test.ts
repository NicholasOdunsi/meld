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
        // Falls back to the originating screen when the row carries no batch.
        screens: [
          {
            id: screenId,
            name: "Sign in",
            state: "built",
            currentVersionId: "80000000-0000-4000-8000-000000000008",
          },
        ],
        userPrompt: "A clean sign in screen",
        initiatedBy: userId,
        taskStatus: "completed",
        screenState: "built",
        currentVersionId: "80000000-0000-4000-8000-000000000008",
        createdAt: "2026-08-17T00:00:00.000Z",
      },
    ]);
  });

  it("carries every screen the task built, not just the originating one", async () => {
    // A generation returns a batch. Only the originating screen has a
    // design_screen_generations row, so a run that built four screens used to
    // surface one and the rest were invisible in the conversation.
    const rpc = vi.fn(async () => ({
      data: [
        {
          task_id: taskId,
          screen_id: screenId,
          screen_name: "My Inspections",
          user_prompt: "use green instead of red",
          initiated_by: userId,
          task_status: "completed",
          screen_state: "built",
          current_version_id: "80000000-0000-4000-8000-000000000008",
          created_at: "2026-08-23T00:00:00.000Z",
          screens: [
            { id: screenId, name: "My Inspections", state: "built", currentVersionId: "80000000-0000-4000-8000-000000000008" },
            { id: "50000000-0000-4000-8000-0000000000f2", name: "Profile", state: "built", currentVersionId: "80000000-0000-4000-8000-0000000000f9" },
          ],
        },
      ],
      error: null,
    }));
    mocks.createClient.mockResolvedValue({ rpc });

    const [turn] = await listDesignAgentTurns(roomId);
    expect(turn.screens.map((s) => s.name)).toEqual([
      "My Inspections",
      "Profile",
    ]);
  });

  it("still describes a turn whose row predates the screens column", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          task_id: taskId,
          screen_id: screenId,
          screen_name: "Sign in",
          user_prompt: null,
          initiated_by: userId,
          task_status: "completed",
          screen_state: "built",
          current_version_id: null,
          created_at: "2026-08-17T00:00:00.000Z",
        },
      ],
      error: null,
    }));
    mocks.createClient.mockResolvedValue({ rpc });

    const [turn] = await listDesignAgentTurns(roomId);
    expect(turn.screens).toEqual([
      { id: screenId, name: "Sign in", state: "built", currentVersionId: null },
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
