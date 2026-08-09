import "server-only";

import type { PrdAssistScopeSection, Provider } from "@meld/contracts";
import { isMissingModelAwareRpc } from "@/features/ai/model-rpc-compat";
import { createClient } from "@/lib/supabase/server";

// Queue one contextual PRD request. The RPC is the authority on everything
// that matters here -- participation, a paired device with a ready provider,
// the section scope, the frozen manifest, and whether this caller may produce
// an edit at all -- so this wrapper only carries the call and hands back the
// two ids the composer needs to follow the request.
export async function createPrdSectionAssistTask(input: {
  roomId: string;
  clientRequestId: string;
  sections: PrdAssistScopeSection[];
  instruction: string;
  provider?: Provider;
  model?: string;
}): Promise<{ taskId: string; requestId: string }> {
  const supabase = await createClient(new Headers());
  let result = await supabase.rpc(
    "create_prd_section_assist_task",
    {
      target_room_id: input.roomId,
      target_sections: input.sections,
      target_instruction: input.instruction,
      target_client_request_id: input.clientRequestId,
      target_provider: input.provider ?? null,
      target_model: input.model ?? null,
    },
  );
  if (isMissingModelAwareRpc(result.error)) {
    result = await supabase.rpc("create_prd_section_assist_task", {
      target_room_id: input.roomId,
      target_sections: input.sections,
      target_instruction: input.instruction,
      target_client_request_id: input.clientRequestId,
      target_provider: input.provider ?? null,
    });
  }
  const { data, error } = result;
  if (error || !data) {
    throw new Error("Could not send this to the Product Agent.");
  }
  return data as { taskId: string; requestId: string };
}
