"use server";

import { AITaskStatusSchema } from "@meld/contracts";
import type { AITaskStatus } from "@meld/contracts";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";

// One row per design-screen generation, oldest first -- the durable Agents
// transcript. `userPrompt` is the user's raw words (may be null for very old
// rows created before prompt persistence, or a blank prompt); the agent's
// reply is derived from `taskStatus` + `screenState` + `currentVersionId`.
export type DesignAgentTurn = {
  taskId: string;
  screenId: string;
  screenName: string;
  userPrompt: string | null;
  initiatedBy: string;
  taskStatus: AITaskStatus;
  screenState: "empty" | "built";
  currentVersionId: string | null;
  createdAt: string;
};

const TurnRow = z
  .object({
    task_id: z.string().uuid(),
    screen_id: z.string().uuid(),
    screen_name: z.string(),
    user_prompt: z.string().nullable(),
    initiated_by: z.string().uuid(),
    task_status: AITaskStatusSchema,
    screen_state: z.enum(["empty", "built"]),
    current_version_id: z.string().uuid().nullable(),
    created_at: z.string(),
  })
  .passthrough();

function asRows(data: unknown): unknown[] {
  return Array.isArray(data) ? data : data ? [data] : [];
}

export async function listDesignAgentTurns(
  roomId: string,
): Promise<DesignAgentTurn[]> {
  const id = z.string().uuid().safeParse(roomId);
  if (!id.success) return [];
  try {
    let raw: unknown;
    if (isRoomFakeEnabled()) {
      const { fakeListDesignAgentTurns } = await import(
        "@/features/rooms/e2e-fake"
      );
      raw = await fakeListDesignAgentTurns(id.data);
    } else {
      const supabase = await createClient(new Headers());
      const { data, error } = await supabase.rpc("list_design_agent_turns", {
        target_room_id: id.data,
      });
      if (error) {
        console.error("listDesignAgentTurns RPC error", { roomId, error });
        return [];
      }
      raw = data;
    }
    // Both the RPC and the fake return the same snake_case row shape; parse and
    // map through one path so validation and the camelCase projection are
    // shared.
    const rows = z.array(TurnRow).safeParse(asRows(raw));
    if (!rows.success) {
      console.error("listDesignAgentTurns parse failed", { roomId, raw });
      return [];
    }
    return rows.data.map((row) => ({
      taskId: row.task_id,
      screenId: row.screen_id,
      screenName: row.screen_name,
      userPrompt: row.user_prompt,
      initiatedBy: row.initiated_by,
      taskStatus: row.task_status,
      screenState: row.screen_state,
      currentVersionId: row.current_version_id,
      createdAt: row.created_at,
    }));
  } catch {
    return [];
  }
}
