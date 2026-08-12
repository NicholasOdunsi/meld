"use server";

import { FlowDocumentSchema } from "@meld/contracts";
import { z } from "zod";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";
import { createClient } from "@/lib/supabase/server";

const InputSchema = z
  .object({
    roomId: z.string().uuid(),
    flow: FlowDocumentSchema,
  })
  .strict();

export type SyncUserJourneyInput = z.input<typeof InputSchema>;

// Writes the flow extracted from the canvas into the room's current PRD
// user-journey section (see set_prd_user_journeys). Fire-and-forget from the
// canvas when the user leaves it: it returns a plain ok flag and never throws,
// so a failed sync degrades to "the section keeps its previous journey".
export async function syncUserJourneyFromCanvas(
  input: SyncUserJourneyInput,
): Promise<{ ok: boolean }> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) return { ok: false };

  if (isRoomFakeEnabled()) return { ok: true };

  try {
    const supabase = await createClient(new Headers());
    const { error } = await supabase.rpc("set_prd_user_journeys", {
      target_room_id: parsed.data.roomId,
      target_flow: parsed.data.flow,
    });
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}
