import type { AttentionItem, AttentionResolver } from "./types";

export type MentionRow = {
  id: string;
  room_id: string;
  created_at: string;
  rooms: {
    name: string;
    workspace_id: string;
  } | null;
};

// Caps how many unacknowledged mentions a single request can pull. This is a
// home-screen widget, not a full inbox -- nothing needs to page through
// more than this in one load.
const MAX_MENTIONS = 50;

export type MentionQueryClient = {
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
          is: (
            column: string,
            value: null,
          ) => {
            order: (
              column: string,
              options: { ascending: boolean },
            ) => {
              limit: (count: number) => Promise<{
                data: MentionRow[] | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
    };
  };
};

export function createMentionResolver(
  supabase: MentionQueryClient,
): AttentionResolver {
  return {
    kind: "mention",
    async resolve(context) {
      const result = await supabase
        .from("mentions")
        .select(
          "id,room_id,created_at,rooms!inner(name,workspace_id)",
        )
        .eq("mentioned_user_id", context.userId)
        // Constrains the embed at the database rather than relying solely on
        // the JS filter below: an inner join means PostgREST never returns a
        // row from another workspace in the first place. This is the
        // worked example for the other, non-self-scoped resolvers still to
        // come (approval_request, assigned_work) -- RLS on `mentions` does
        // not enforce the workspace boundary, so the query must.
        .eq("rooms.workspace_id", context.workspaceId)
        .is("acknowledged_at", null)
        .order("created_at", { ascending: false })
        .limit(MAX_MENTIONS);

      if (result.error) {
        throw new Error("We could not load mentions.");
      }

      // Defence-in-depth only: the query above already guarantees every row
      // belongs to context.workspaceId. Kept in case the query above is
      // ever weakened (e.g. the inner join or .eq is dropped) without this
      // filter being updated in lockstep.
      return (result.data ?? [])
        .filter(
          (row) =>
            row.rooms?.workspace_id ===
            context.workspaceId,
        )
        .map((row): AttentionItem => {
          const roomName = row.rooms?.name ?? "a room";
          return {
            id: row.id,
            kind: "mention",
            title: `You were mentioned in ${roomName}`,
            roomId: row.room_id,
            roomName,
            occurredAt: row.created_at,
            href: `/${context.workspaceId}/rooms/${row.room_id}`,
          };
        });
    },
  };
}
