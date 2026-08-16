import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  createRoomReplyTask as createRoomReplyTaskRpc,
  type CreateRoomReplyTaskInput,
} from "./task-service";

// Thin request-scoped wrapper the room `postMessage` action calls once a
// human message has persisted. It authenticates the caller's session, then
// delegates to the task-service RPC binding. The RPC (create_room_reply_task)
// is idempotent per source message and resolves the device/provider server
// side, so all this layer adds is the authenticated client -- the task logic
// stays in the RPC, never duplicated here or in the room repository.
export async function createRoomReplyTask(input: CreateRoomReplyTaskInput) {
  const supabase = await createClient(new Headers());
  return createRoomReplyTaskRpc(supabase, input);
}
