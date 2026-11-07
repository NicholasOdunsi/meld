import "server-only";

import { InspirationMimeTypeSchema } from "@meld/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { INSPIRATION_BUCKET } from "../inspiration-shared";
import { LabelerError, type InspirationLabeler } from "./deepseek-labeler";

export const SORT_BATCH_SIZE = 10;

const ClaimedRowsSchema = z.array(
  z.object({ item_id: z.string().uuid(), storage_path: z.string(), mime_type: InspirationMimeTypeSchema }),
);

class SortStepError extends Error {
  constructor(readonly code: "download_failed" | "save_failed") {
    super(code);
  }
}

function errorCode(error: unknown): string {
  return error instanceof LabelerError || error instanceof SortStepError ? error.code : "unknown";
}

// Claims up to one batch for the workspace and labels it item by item. A
// failure only releases that item; the RPC turns it unsortable after 3 tries.
export async function sortInspirationBacklog(
  workspaceId: string,
  { client, labeler }: { client: SupabaseClient; labeler: InspirationLabeler },
): Promise<{ sorted: number; failed: number }> {
  const { data, error } = await client.rpc("claim_inspiration_sort", {
    target_workspace_id: workspaceId,
    batch_limit: SORT_BATCH_SIZE,
  });
  const claimed = ClaimedRowsSchema.safeParse(data);
  if (error || !claimed.success) {
    console.error("claim_inspiration_sort failed", { code: error?.code });
    return { sorted: 0, failed: 0 };
  }

  let sorted = 0;
  let failed = 0;
  for (const row of claimed.data) {
    try {
      const download = await client.storage.from(INSPIRATION_BUCKET).download(row.storage_path);
      if (download.error || !download.data) throw new SortStepError("download_failed");
      const bytes = new Uint8Array(await download.data.arrayBuffer());
      const labels = await labeler.label(bytes, row.mime_type);
      const saved = await client.rpc("save_inspiration_labels", {
        target_item_id: row.item_id,
        item_labels: labels,
        labels_model: labeler.model,
      });
      if (saved.error) throw new SortStepError("save_failed");
      sorted += 1;
    } catch (stepError) {
      failed += 1;
      console.error("inspiration sort failed", { itemId: row.item_id, code: errorCode(stepError) });
      await client.rpc("release_inspiration_sort", { target_item_id: row.item_id }).then(undefined, () => undefined);
    }
  }
  return { sorted, failed };
}
