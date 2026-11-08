"use client";

import type { AITaskStatus } from "@meld/contracts";
import { useEffect, useRef } from "react";
import type { RoomTaskStatus } from "@/features/ai/room-task-status";
import { postToNative } from "./bridge";
import { taskCompletionNotices } from "./task-notices";

export function useNativeTaskNotifications(statuses: readonly RoomTaskStatus[], roomName: string | undefined, hasCompletedInitialRead: boolean) {
  const previous = useRef<Map<string, AITaskStatus> | null>(null);

  useEffect(() => {
    if (!hasCompletedInitialRead) return;
    const notices = taskCompletionNotices(previous.current, statuses, roomName);
    const path = `${window.location.pathname}${window.location.search}`;
    for (const notice of notices) postToNative({ v: 1, type: "notify", ...notice, path });
    previous.current = new Map(statuses.map((task) => [task.taskId, task.status]));
  }, [statuses, roomName, hasCompletedInitialRead]);
}
