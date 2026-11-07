import "server-only";

import { after } from "next/server";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";
import { createShelfServerClient } from "@/lib/supabase/shelf-server";
import { DEEPSEEK_DEFAULT_MODEL, createDeepSeekLabeler } from "./deepseek-labeler";
import { sortInspirationBacklog } from "./sort-backlog";

let warnedMissingKey = false;

// Sorts the workspace's backlog after the response is sent, so a save or page
// load never waits on DeepSeek. Uses the shelf's service-role client because
// the sort RPCs are service_role-only.
export function scheduleInspirationSort(workspaceId: string): void {
  if (isRoomFakeEnabled()) return;
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      console.warn("DEEPSEEK_API_KEY is not set; inspiration sorting is off.");
    }
    return;
  }
  const model = process.env.DEEPSEEK_VISION_MODEL || DEEPSEEK_DEFAULT_MODEL;
  after(async () => {
    try {
      await sortInspirationBacklog(workspaceId, {
        client: createShelfServerClient(),
        labeler: createDeepSeekLabeler({ apiKey, model }),
      });
    } catch {
      console.error("inspiration sort run failed");
    }
  });
}
