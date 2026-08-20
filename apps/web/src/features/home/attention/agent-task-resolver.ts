import type { AttentionItem, AttentionResolver } from "./types";

// The two `ai_task_status` values that mean "a person has to do something".
// `needs_review` is the agent finishing and holding; `failed` is the run
// giving up. Every other status is in-flight or already settled.
const STATUS_BY_KIND = {
  approval_request: ["needs_review"],
  agent_run_failed: ["failed"],
} as const;

export type AgentTaskKind = keyof typeof STATUS_BY_KIND;

// Same cap and rationale as the mention resolver: this is a home-screen
// widget, not an inbox.
const MAX_TASKS = 50;

export type AgentTaskRow = {
  id: string;
  room_id: string;
  status: string;
  error_message: string | null;
  updated_at: string;
  rooms: {
    name: string;
    workspace_id: string;
  } | null;
};

export type AgentTaskQueryClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        eq: (
          column: string,
          value: string,
        ) => {
          in: (
            column: string,
            values: readonly string[],
          ) => {
            order: (
              column: string,
              options: { ascending: boolean },
            ) => {
              limit: (count: number) => Promise<{
                data: AgentTaskRow[] | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
    };
  };
};

export function createAgentTaskResolver(
  supabase: AgentTaskQueryClient,
  kind: AgentTaskKind,
): AttentionResolver {
  return {
    kind,
    async resolve(context) {
      const result = await supabase
        .from("ai_tasks")
        .select(
          "id,room_id,status,error_message,updated_at,rooms!inner(name,workspace_id)",
        )
        .eq("initiating_user_id", context.userId)
        // RLS on ai_tasks does not enforce the workspace boundary, so the
        // inner join must: PostgREST never returns another workspace's row
        // in the first place. Mirrors mention-resolver.ts.
        .eq("rooms.workspace_id", context.workspaceId)
        .in("status", STATUS_BY_KIND[kind])
        .order("updated_at", { ascending: false })
        .limit(MAX_TASKS);

      if (result.error) {
        throw new Error("We could not load agent runs.");
      }

      // Defence-in-depth, as in mention-resolver.ts: kept in case the query
      // above is ever weakened without this filter being updated with it.
      return (result.data ?? [])
        .filter((row) => row.rooms?.workspace_id === context.workspaceId)
        .map(
          (row): AttentionItem => ({
            id: row.id,
            kind,
            title:
              kind === "approval_request"
                ? "An agent finished and is waiting on your yes or no."
                : (row.error_message ?? "An agent run failed."),
            roomId: row.room_id,
            roomName: row.rooms?.name ?? "a room",
            occurredAt: row.updated_at,
            href: `/${context.workspaceId}/rooms/${row.room_id}`,
            actionLabel: kind === "approval_request" ? "REVIEW" : "OPEN",
          }),
        );
    },
  };
}
