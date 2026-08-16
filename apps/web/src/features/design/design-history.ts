import type { RoomMessage } from "@/features/rooms/repository";
import type { DesignScreenEvent } from "@meld/contracts";

export type DesignHistoryEntry =
  | { type: "message"; id: string; createdAt: string; message: RoomMessage }
  | { type: "event"; id: string; createdAt: string; event: DesignScreenEvent };

// The Canvas history feed: the room conversation unified with design events, one
// chronological list. Deterministic (createdAt then id) so renders are stable.
export function mergeDesignHistory(
  messages: RoomMessage[],
  events: DesignScreenEvent[],
): DesignHistoryEntry[] {
  const entries: DesignHistoryEntry[] = [
    ...messages.map((message): DesignHistoryEntry => ({
      type: "message", id: message.id, createdAt: message.createdAt, message,
    })),
    ...events.map((event): DesignHistoryEntry => ({
      type: "event", id: event.id, createdAt: event.createdAt, event,
    })),
  ];
  return entries.sort((a, b) =>
    a.createdAt === b.createdAt
      ? a.id < b.id ? -1 : a.id > b.id ? 1 : 0
      : a.createdAt < b.createdAt ? -1 : 1,
  );
}

// Deselected shows the whole feed. With a screen selected the drawer filters to
// that screen -- its design-event timeline (the deterministic per-screen source
// the events table exists to provide). Room-level messages are not screen-scoped,
// so they fall away under a screen filter.
export function filterDesignHistory(
  entries: DesignHistoryEntry[],
  selectedScreenId: string | null,
): DesignHistoryEntry[] {
  if (selectedScreenId === null) return entries;
  return entries.filter(
    (entry) => entry.type === "event" && entry.event.screenId === selectedScreenId,
  );
}
