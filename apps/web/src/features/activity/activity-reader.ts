import { RoomActivitySchema, type RoomActivity } from "@meld/contracts";

export type ActivityRpcClient = {
  rpc: (
    fn: "list_workspace_activity",
    args: { target_workspace_id: string },
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

type ActivityRow = {
  room_id: string; project_id: string; room_name: string;
  state: string; reason: string | null;
  task_kind: string | null; task_status: string | null; provider: string | null;
  proposal_kind: string | null; proposal_message_id: string | null;
  occurred_at: string | null; last_activity_at: string | null;
};

const READ_ERROR = "We could not load what's happening in your projects.";

export async function readWorkspaceActivity(
  client: ActivityRpcClient,
  workspaceId: string,
): Promise<RoomActivity[]> {
  const { data, error } = await client.rpc("list_workspace_activity", {
    target_workspace_id: workspaceId,
  });
  if (error) throw new Error(READ_ERROR);
  const rows = (Array.isArray(data) ? data : []) as ActivityRow[];
  return rows.flatMap((row) => {
    const parsed = RoomActivitySchema.safeParse({
      roomId: row.room_id,
      projectId: row.project_id,
      roomName: row.room_name,
      state: row.state,
      reason: row.reason,
      taskKind: row.task_kind,
      taskStatus: row.task_status,
      provider: row.provider,
      proposalKind: row.proposal_kind,
      proposalMessageId: row.proposal_message_id,
      occurredAt: row.occurred_at,
      lastActivityAt: row.last_activity_at,
    });
    return parsed.success ? [parsed.data] : [];
  });
}
