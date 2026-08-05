import "server-only";

import { getDiscoveryBackend } from "@/features/discovery/backend";
import { isDiscoveryFakeEnabled } from "@/features/discovery/e2e-gate";
import { createClient } from "@/lib/supabase/server";
import { createPrdRepository } from "./repository";
import { RoomPrdInputSchema, type RoomPrd } from "./schemas";

const RoomPrdHistoryInputSchema = RoomPrdInputSchema.strict();

export async function getRoomPrd(input: {
  roomId: string;
}): Promise<RoomPrd | null> {
  const { roomId } = RoomPrdInputSchema.parse(input);
  if (isDiscoveryFakeEnabled()) {
    return (await getDiscoveryBackend()).getRoomPrd({ roomId });
  }
  const supabase = await createClient(new Headers());
  return createPrdRepository(supabase).getRoomPrd(roomId);
}

export async function getRoomPrdHistory(input: {
  roomId: string;
}): Promise<RoomPrd[]> {
  const { roomId } = RoomPrdHistoryInputSchema.parse(input);
  return (await getDiscoveryBackend()).getRoomPrdHistory({ roomId });
}
