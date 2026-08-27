"use server";

import { createClient } from "@/lib/supabase/server";
import type { Room } from "@/features/rooms/repository";
import { composeAttentionItems } from "./attention/registry";
import {
  createMentionResolver,
  type MentionQueryClient,
} from "./attention/mention-resolver";
import {
  createAgentTaskResolver,
  type AgentTaskQueryClient,
} from "./attention/agent-task-resolver";
import { createIdleRoomResolver } from "./attention/idle-room-resolver";
import type { AttentionItem } from "./attention/types";

export async function listAttentionItems(
  workspaceId: string,
): Promise<AttentionItem[]> {
  const supabase = await createClient(new Headers());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return [];
  }

  return composeAttentionItems(
    [
      createMentionResolver(
        supabase as unknown as MentionQueryClient,
      ),
    ],
    { userId: user.id, workspaceId },
  );
}

export async function listPendingItems(
  workspaceId: string,
  rooms: Room[],
): Promise<AttentionItem[]> {
  const supabase = await createClient(new Headers());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return [];
  }

  return composeAttentionItems(
    [
      createMentionResolver(
        supabase as unknown as MentionQueryClient,
      ),
      createAgentTaskResolver(
        supabase as unknown as AgentTaskQueryClient,
        "approval_request",
      ),
      createAgentTaskResolver(
        supabase as unknown as AgentTaskQueryClient,
        "agent_run_failed",
      ),
      // No query: the page already fetched the rooms.
      createIdleRoomResolver({ rooms, now: new Date() }),
    ],
    { userId: user.id, workspaceId },
  );
}

export async function acknowledgeMention(mentionId: string) {
  const supabase = await createClient(new Headers());
  const { error } = await supabase
    .from("mentions")
    .update({ acknowledged_at: new Date().toISOString() })
    .eq("id", mentionId);

  if (error) {
    throw new Error("We could not update that mention.");
  }
}
