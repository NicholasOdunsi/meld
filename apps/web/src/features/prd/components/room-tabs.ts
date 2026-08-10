export type RoomTab = "conversation" | "prd" | "user-flows";

// Server-safe pure helper: the room page (a Server Component) calls this to
// resolve the active tab, so it must live outside the "use client" component
// module. PRD remains a valid destination while its async task is materializing
// the first document row; progressive visibility is controlled client-side.
export function parseRoomTab(
  raw: string | undefined,
  _hasPrd: boolean,
  hasUserFlows = false,
): RoomTab {
  if (raw === "user-flows" && hasUserFlows) return "user-flows";
  if (raw === "prd") return "prd";
  return "conversation";
}
