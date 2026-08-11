import "server-only";

import { getRoomBackend } from "@/features/rooms/backend";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";
import { createClient } from "@/lib/supabase/server";
import { createPrdRepository } from "./repository";
import { RoomPrdInputSchema, type RoomPrd } from "./schemas";

const RoomPrdHistoryInputSchema = RoomPrdInputSchema.strict();

export async function getRoomPrd(input: {
  roomId: string;
}): Promise<RoomPrd | null> {
  const { roomId } = RoomPrdInputSchema.parse(input);
  if (isRoomFakeEnabled()) {
    return (await getRoomBackend()).getRoomPrd({ roomId });
  }
  const supabase = await createClient(new Headers());
  return createPrdRepository(supabase).getRoomPrd(roomId);
}

export async function getRoomPrdHistory(input: {
  roomId: string;
}): Promise<RoomPrd[]> {
  const { roomId } = RoomPrdHistoryInputSchema.parse(input);
  return (await getRoomBackend()).getRoomPrdHistory({ roomId });
}
