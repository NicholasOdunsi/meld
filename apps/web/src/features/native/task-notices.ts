import type { AITaskStatus } from "@meld/contracts";
import { isTerminalTaskStatus, type RoomTaskStatus } from "@/features/ai/room-task-status";

export type TaskNotice = { title: string; body: string };

function noticeFor(kind: RoomTaskStatus["kind"], where: string): TaskNotice | null {
  switch (kind) {
    case "room_reply":
      return { title: "Orion replied", body: `In ${where}` };
    case "design_screen_generate":
      return { title: "Screens ready", body: `New screens in ${where}` };
    case "user_flow_generate":
      return { title: "User flow ready", body: `In ${where}` };
    default:
      return null;
  }
}

/** Tasks that went from in-flight to completed between two reads. `previous === null` is the first read. */
export function taskCompletionNotices(
  previous: ReadonlyMap<string, AITaskStatus> | null,
  next: readonly RoomTaskStatus[],
  roomName: string | undefined,
): TaskNotice[] {
  if (previous === null) return [];
  const where = roomName?.trim() ? roomName.trim() : "your room";
  const notices: TaskNotice[] = [];
  for (const task of next) {
    const before = previous.get(task.taskId);
    if (before === undefined || isTerminalTaskStatus(before) || task.status !== "completed") continue;
    const notice = noticeFor(task.kind, where);
    if (notice) notices.push(notice);
  }
  return notices;
}
