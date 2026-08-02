import "server-only";

import { createClient } from "@/lib/supabase/server";
import { cancelAITask } from "./task-service";

// Request-scoped wrapper the room's cancel recovery action calls. It
// authenticates the caller's session and delegates to cancel_ai_task, whose
// own security-definer body enforces that only the task's initiating user may
// cancel it -- the ownership check lives in the RPC, not here.
export async function cancelRoomReplyTask(taskId: string) {
  const supabase = await createClient(new Headers());
  return cancelAITask(supabase, taskId);
}
