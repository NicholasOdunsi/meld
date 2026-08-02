export type RoomTab = "conversation" | "prd";

// Server-safe pure helper: the room page (a Server Component) calls this to
// resolve the active tab, so it must live outside the "use client" component
// module. Clamps ?tab=prd to conversation until a PRD exists.
export function parseRoomTab(
  raw: string | undefined,
  hasPrd: boolean,
): RoomTab {
  if (raw === "prd" && hasPrd) return "prd";
  return "conversation";
}
