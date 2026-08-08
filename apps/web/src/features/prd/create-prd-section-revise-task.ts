import "server-only";

import type { Provider } from "@meld/contracts";
import { createClient } from "@/lib/supabase/server";

export async function createPrdSectionReviseTask(input: {
  roomId: string;
  field: string;
  sectionLabel: string;
  instruction: string;
  quotedText: string | null;
  provider?: Provider;
}): Promise<{ id: string; status: string }> {
  const supabase = await createClient(new Headers());
  const { data, error } = await supabase.rpc("create_prd_section_revise_task", {
    target_room_id: input.roomId,
    target_section_field: input.field,
    target_section_label: input.sectionLabel,
    target_instruction: input.instruction,
    target_quoted_text: input.quotedText,
    target_provider: input.provider ?? null,
  });
  if (error || !data) {
    throw new Error("Could not start the PRD section revision.");
  }
  return data as { id: string; status: string };
}
