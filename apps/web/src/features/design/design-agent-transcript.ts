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
/** One screen a generation produced. A run returns a batch, not just one. */
export type DesignAgentTurnScreen = {
  id: string;
  name: string;
  state: "empty" | "built";
  currentVersionId: string | null;
};

export type DesignAgentTurn = {
  taskId: string;
  /** The screen the task was queued against -- the batch's first. */
  screenId: string;
  screenName: string;
  /**
   * Every live screen this task built, the originating one included. A batch
   * only records a generation row for the originating screen, so a turn that
   * described that alone left the rest of the run invisible.
   */
  screens: DesignAgentTurnScreen[];
  /**
   * True when this run was applied to screens that already existed, rather
   * than building new ones. It is what lets the request show which screens it
   * was aimed at: a freshly built screen was never selected, so naming it back
   * as an attachment would claim a choice nobody made.
   */
  editedExisting: boolean;
  userPrompt: string | null;
  initiatedBy: string;
  taskStatus: AITaskStatus;
  screenState: "empty" | "built";
  currentVersionId: string | null;
  createdAt: string;
  /**
   * Groups the runs of one chained request. Null for a single-run turn.
   *
   * A chain is several tasks minutes apart with different instructions, so the
   * "same prompt within 60 seconds" rule cannot see they belong together.
   */
  chainId: string | null;
  /**
   * The flow's size as the first run saw it. Fixed for the chain's life, so
   * the progress count cannot appear to go backwards.
   */
  chainTotal: number;
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
    // Absent on rows written before the aggregate existed; the mapper falls
    // back to the originating screen so a turn always describes something.
    screens: z
      .array(
        z.object({
          id: z.string().uuid(),
          name: z.string(),
          state: z.enum(["empty", "built"]),
          currentVersionId: z.string().uuid().nullable(),
        }),
      )
      .nullish(),
    edited_existing: z.boolean().nullish(),
    chainId: z.string().uuid().nullish(),
    chainTotal: z.number().nullish(),
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
      editedExisting: row.edited_existing ?? false,
      screens: row.screens?.length
        ? row.screens
        : [
            {
              id: row.screen_id,
              name: row.screen_name,
              state: row.screen_state,
              currentVersionId: row.current_version_id,
            },
          ],
      userPrompt: row.user_prompt,
      initiatedBy: row.initiated_by,
      taskStatus: row.task_status,
      screenState: row.screen_state,
      currentVersionId: row.current_version_id,
      createdAt: row.created_at,
      chainId: row.chainId ?? null,
      chainTotal: row.chainTotal ?? 0,
    }));
  } catch {
    return [];
  }
}
