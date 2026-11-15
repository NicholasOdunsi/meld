import type { RoomTaskStatus } from "@/features/ai/room-task-status";
import type { StreamActivity, StreamActivityPhase, StreamScreen } from "./bridge";

function phaseFor(task: RoomTaskStatus, isLatest: boolean): StreamActivityPhase | null {
  const design = task.kind === "design_screen_generate";
  switch (task.status) {
    case "queued":
    case "ready_to_run":
      return design ? "designing" : "reading";
    case "running":
      return design ? "designing" : "replying";
    case "waiting_for_device":
      return "offline";
    case "needs_reauthentication":
      return "needs_signin";
    case "usage_limit_reached":
      return "limit_reached";
    case "failed":
      return isLatest ? "failed" : null;
    default:
      return null;
  }
}

export function deriveActivity(
  tasks: RoomTaskStatus[],
  stars: { id: string; followupMessageIds: string[] }[],
  screens: StreamScreen[],
): StreamActivity[] {
  const starByFollowup = new Map<string, string>();
  for (const star of stars) {
    for (const id of star.followupMessageIds) starByFollowup.set(id, star.id);
  }
  const buildingName = screens.find((screen) => screen.state === "building")?.name ?? null;
  const latest = [...tasks].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  const activity: StreamActivity[] = [];
  for (const task of tasks) {
    const phase = phaseFor(task, task === latest);
    if (!phase) continue;
    activity.push({
      taskId: task.taskId,
      starId: task.sourceMessageId ? (starByFollowup.get(task.sourceMessageId) ?? null) : null,
      phase,
      screenName: task.kind === "design_screen_generate" ? buildingName : null,
    });
  }
  return activity;
}
