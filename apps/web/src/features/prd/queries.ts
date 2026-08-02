import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createPrdRepository } from "./repository";
import { RoomPrdInputSchema, type RoomPrd } from "./schemas";

export async function getRoomPrd(input: {
  roomId: string;
}): Promise<RoomPrd | null> {
  const { roomId } = RoomPrdInputSchema.parse(input);
  const supabase = await createClient(new Headers());
  return createPrdRepository(supabase).getRoomPrd(roomId);
}
