import "server-only";

import type { Provider } from "@meld/contracts";
import { createClient } from "@/lib/supabase/server";

export async function createPrdReviseTask(input: {
  roomId: string;
  sourceTaskId: string;
  provider?: Provider;
}): Promise<{ id: string; status: string }> {
  const supabase = await createClient(new Headers());
  const { data, error } = await supabase.rpc("create_prd_revise_task", {
    target_room_id: input.roomId,
    source_task_id: input.sourceTaskId,
    target_provider: input.provider ?? null,
  });
  if (error || !data) {
    throw new Error("Could not start PRD revision.");
  }
  return data as { id: string; status: string };
}
