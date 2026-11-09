"use client";

import { useEffect } from "react";
import { markRoomViewed } from "../actions";
import { useWorkspaceActivity } from "../workspace-activity-provider";

/** Opening a tab means you've seen its finished work: clear it, and keep clearing while you watch. */
export function MarkRoomViewed({ roomId }: { roomId: string }) {
  const { byRoom, refresh } = useWorkspaceActivity();
  const room = byRoom.get(roomId);
  const finishedAt = room?.reason === "finished" ? room.occurredAt : null;

  useEffect(() => {
    markRoomViewed(roomId).then(refresh, () => {});
  }, [roomId, refresh]);

  useEffect(() => {
    if (finishedAt) markRoomViewed(roomId).then(refresh, () => {});
  }, [roomId, finishedAt, refresh]);

  return null;
}
