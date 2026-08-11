import "server-only";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isWorkspaceFakeEnabled } from "./e2e-gate";

// Whether another workspace is waiting on the signed-in member, and nothing
// more. The database decides this from Rooms the member actually participates
// in; all that crosses the wire is a workspace id and a boolean. The schema is
// strict so a row that ever carried more than those two columns is refused
// rather than quietly carried into the rail.
const WorkspaceAttentionRowSchema = z
  .object({
    workspace_id: z.string().uuid(),
    has_attention: z.boolean(),
  })
  .strict();

// Attention is the kind of signal that must fail closed: a summary that cannot
// be read or understood means no dot, never a dot the member cannot explain.
// Navigation renders either way.
export async function listWorkspaceAttention(): Promise<ReadonlySet<string>> {
  const attention = new Set<string>();
  // The e2e fake reaches no database at all, so the workspace shell it stands
  // in for answers this the same way: from its own seed.
  if (isWorkspaceFakeEnabled()) {
    const { listFakeWorkspaceAttention } = await import("./e2e-fake");
    return listFakeWorkspaceAttention();
  }

  try {
    const supabase = await createClient(new Headers());
    const { data, error } = await supabase.rpc("list_workspace_attention");
    if (error) return attention;

    for (const row of Array.isArray(data) ? data : []) {
      const parsed = WorkspaceAttentionRowSchema.safeParse(row);
      if (parsed.success && parsed.data.has_attention) {
        attention.add(parsed.data.workspace_id);
      }
    }
  } catch {
    return new Set();
  }

  return attention;
}
