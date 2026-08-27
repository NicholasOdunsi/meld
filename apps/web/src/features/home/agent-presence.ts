// The three statuses that mean an agent is between "asked" and "answered".
const IN_FLIGHT = ["running", "ready_to_run", "queued"] as const;

export type PresenceQueryClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        in: (
          column: string,
          values: readonly string[],
        ) => {
          limit: (count: number) => Promise<{
            data: Array<{ id: string }> | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
};

/**
 * Whether any agent is mid-run in this workspace. Drives the working sprite
 * on the ticket, so it fails closed: a broken query renders an idle agent
 * rather than animating a teammate that is not actually working.
 */
export async function isAnyAgentWorking(
  supabase: PresenceQueryClient,
  workspaceId: string,
): Promise<boolean> {
  const result = await supabase
    .from("ai_tasks")
    .select("id,rooms!inner(workspace_id)")
    .eq("rooms.workspace_id", workspaceId)
    .in("status", IN_FLIGHT)
    .limit(1);

  if (result.error) {
    return false;
  }

  return (result.data ?? []).length > 0;
}
