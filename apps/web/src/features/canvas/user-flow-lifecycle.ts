"use server";

import { z } from "zod";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";
import { createClient } from "@/lib/supabase/server";

const RoomIdSchema = z.string().uuid();
const UserFlowLifecycleRowSchema = z.object({
  room_id: z.string().uuid(),
  created_by: z.string().uuid(),
  created_at: z.string().datetime({ offset: true }),
}).strict();

export type UserFlowLifecycle = {
  roomId: string;
  createdBy: string;
  createdAt: string;
};

const START_ERROR = "We could not start that user flow.";

function parseLifecycle(data: unknown): UserFlowLifecycle {
  const candidate = Array.isArray(data) ? data[0] : data;
  const row = UserFlowLifecycleRowSchema.parse(candidate);
  return {
    roomId: row.room_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export async function startUserFlow(
  roomId: string,
): Promise<UserFlowLifecycle> {
  const parsedRoomId = RoomIdSchema.parse(roomId);

  try {
    if (isRoomFakeEnabled()) {
      const { fakeStartUserFlow } = await import("@/features/rooms/e2e-fake");
      return await fakeStartUserFlow(parsedRoomId);
    }

    const supabase = await createClient(new Headers());
    const { data, error } = await supabase.rpc("start_user_flow", {
      target_room_id: parsedRoomId,
    });
    if (error) throw new Error(START_ERROR);
    return parseLifecycle(data);
  } catch {
    throw new Error(START_ERROR);
  }
}
