"use server";

import type { RoomActivity } from "@meld/contracts";
import { createClient } from "@/lib/supabase/server";
import { isWorkspaceFakeEnabled } from "@/features/workspaces/e2e-gate";
import { readWorkspaceActivity, type ActivityRpcClient } from "./activity-reader";

const WRITE_ERROR = "We could not update that. Try again.";

async function client() {
  return createClient(new Headers());
}

export async function getWorkspaceActivity(workspaceId: string): Promise<RoomActivity[]> {
  // Preview / e2e stand on seeded fake workspaces with no Supabase RPC. Polling
  // list_workspace_activity there only throws into the webserver log every 5s.
  if (isWorkspaceFakeEnabled()) return [];
  const supabase = await client();
  return readWorkspaceActivity(supabase as unknown as ActivityRpcClient, workspaceId);
}

async function call(fn: string, args: Record<string, string>) {
  if (isWorkspaceFakeEnabled()) return;
  const supabase = await client();
  const { error } = await supabase.rpc(fn as never, args as never);
  if (error) throw new Error(WRITE_ERROR);
}

export async function markRoomViewed(roomId: string): Promise<void> {
  await call("mark_room_viewed", { target_room_id: roomId });
}

export async function dismissRoomAttention(roomId: string): Promise<void> {
  await call("dismiss_room_attention", { target_room_id: roomId });
}

export async function dismissProposal(messageId: string): Promise<void> {
  await call("dismiss_message_proposal", { target_message_id: messageId });
}
