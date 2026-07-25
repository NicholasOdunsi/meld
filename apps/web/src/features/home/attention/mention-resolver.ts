import type { AttentionItem, AttentionResolver } from "./types";

export type MentionRow = {
  id: string;
  room_id: string;
  created_at: string;
  discovery_rooms: {
    name: string;
    organization_id: string;
  } | null;
};

export type MentionQueryClient = {
  from: (table: string) => {
    select: (columns: string) => {
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
          ) => Promise<{
            data: MentionRow[] | null;
            error: { message: string } | null;
          }>;
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
          "id,room_id,created_at,discovery_rooms(name,organization_id)",
        )
        .eq("mentioned_user_id", context.userId)
        .is("acknowledged_at", null)
        .order("created_at", { ascending: false });

      if (result.error) {
        throw new Error("We could not load mentions.");
      }

      return (result.data ?? [])
        .filter(
          (row) =>
            row.discovery_rooms?.organization_id ===
            context.organizationId,
        )
        .map((row): AttentionItem => {
          const roomName = row.discovery_rooms?.name ?? "a room";
          return {
            id: row.id,
            kind: "mention",
            title: `You were mentioned in ${roomName}`,
            roomId: row.room_id,
            roomName,
            occurredAt: row.created_at,
            href: `/${context.organizationId}/discovery/${row.room_id}`,
          };
        });
    },
  };
}
