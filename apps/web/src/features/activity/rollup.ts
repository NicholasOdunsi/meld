import type { RoomActivity, RoomActivityState } from "@meld/contracts";

export type ProjectActivity = {
  projectId: string;
  state: RoomActivityState;
  room: RoomActivity | null;
};

const time = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);

export function rollUpProjects(rooms: readonly RoomActivity[]): Map<string, ProjectActivity> {
  const result = new Map<string, ProjectActivity>();
  for (const room of rooms) {
    const current = result.get(room.projectId) ?? { projectId: room.projectId, state: "idle", room: null };
    if (current.state === "working") continue;
    if (room.state === "working") {
      result.set(room.projectId, { projectId: room.projectId, state: "working", room });
    } else if (room.state === "needs_you" &&
      (current.state !== "needs_you" || time(room.occurredAt) > time(current.room?.occurredAt ?? null))) {
      result.set(room.projectId, { projectId: room.projectId, state: "needs_you", room });
    } else {
      result.set(room.projectId, current);
    }
  }
  return result;
}
