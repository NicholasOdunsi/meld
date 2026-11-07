import "server-only";

import { after } from "next/server";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";
import { createShelfServerClient } from "@/lib/supabase/shelf-server";
import { DEEPSEEK_DEFAULT_MODEL, createDeepSeekLabeler } from "./deepseek-labeler";
import { createDeepSeekTasteWriter, DEEPSEEK_TEXT_DEFAULT_MODEL } from "../taste/deepseek-taste-writer";
import { refreshTaste } from "../taste/refresh-taste";
import { sortInspirationBacklog } from "./sort-backlog";

let warnedMissingKey = false;

// Sorts the workspace's backlog after the response is sent, so a save or page
// load never waits on DeepSeek. Uses the shelf's service-role client because
// the sort RPCs are service_role-only.
export function scheduleInspirationSort(workspaceId: string, tasteUserId?: string): void {
  if (isRoomFakeEnabled()) return;
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      console.warn("DEEPSEEK_API_KEY is not set; inspiration sorting and taste learning are off.");
    }
    return;
  }
  const model = process.env.DEEPSEEK_VISION_MODEL || DEEPSEEK_DEFAULT_MODEL;
  after(async () => {
    const client = createShelfServerClient();
    try {
      await sortInspirationBacklog(workspaceId, { client, labeler: createDeepSeekLabeler({ apiKey, model }) });
    } catch {
      console.error("inspiration sort run failed");
    }
    // Runs after the sort so freshly sorted images count. B5 rules (in the
    // claim RPC) decide whether it does anything.
    if (!tasteUserId) return;
    try {
      const textModel = process.env.DEEPSEEK_TEXT_MODEL || DEEPSEEK_TEXT_DEFAULT_MODEL;
      await refreshTaste(workspaceId, tasteUserId, {
        client,
        writer: createDeepSeekTasteWriter({ apiKey, model: textModel }),
      });
    } catch {
      console.error("taste refresh run failed");
    }
  });
}
