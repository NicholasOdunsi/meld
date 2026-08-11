"use client";

import type { RoomStage } from "@meld/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { RoomLifecycleRowSchema } from "./stage";

export type RoomLifecycleState = {
  id: string;
  workspaceId: string;
  projectId: string;
  name: string;
  ownerId: string;
  stage: RoomStage;
};

type RoomLifecycleScope =
  | { roomId: string; workspaceId?: never }
  | { workspaceId: string; roomId?: never };

export function reconcileRoomLifecycle(
  rooms: RoomLifecycleState[],
  value: unknown,
) {
  const parsed = RoomLifecycleRowSchema.safeParse(value);
  if (!parsed.success) return rooms;
  const row = parsed.data;
  return rooms.map((room) =>
    room.id === row.id
      ? {
          id: row.id,
          workspaceId: row.workspace_id,
          projectId: row.project_id,
          name: row.name,
          ownerId: row.owner_id,
          stage: row.stage,
        }
      : room,
  );
}

export function useRoomLifecycleRealtime(
  scope: RoomLifecycleScope,
  initialRooms: RoomLifecycleState[],
  enabled = true,
) {
  const { refresh } = useRouter();
  const scopeKind = scope.roomId ? "room" : "workspace";
  const scopeId = scope.roomId ?? scope.workspaceId;
  const initialRoomsKey = initialRooms
    .map(
      (room) =>
        `${room.id}:${room.workspaceId}:${room.projectId}:${room.name}:${room.ownerId}:${room.stage}`,
    )
    .join("|");

  const [roomState, setRoomState] = useState({
    initialRoomsKey,
    rooms: initialRooms,
  });
  if (roomState.initialRoomsKey !== initialRoomsKey) {
    setRoomState({ initialRoomsKey, rooms: initialRooms });
  }

  useEffect(() => {
    if (!enabled) return;
    const supabase = createClient();
    let hasSubscribed = false;
    let mustRefreshBeforeEvents = false;
    let acceptsEvents = true;
    const filter = scope.roomId
      ? `id=eq.${scope.roomId}`
      : `workspace_id=eq.${scope.workspaceId}`;
    const channel = supabase
      .channel(`room-lifecycle:${scopeKind}:${scopeId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "rooms",
          filter,
        },
        (event) => {
          if (!acceptsEvents) return;
          setRoomState((current) => ({
            ...current,
            rooms: reconcileRoomLifecycle(current.rooms, event.new),
          }));
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          if (hasSubscribed && mustRefreshBeforeEvents) {
            refresh();
            mustRefreshBeforeEvents = false;
          }
          hasSubscribed = true;
          acceptsEvents = true;
          return;
        }
        if (
          hasSubscribed &&
          (status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED")
        ) {
          mustRefreshBeforeEvents = true;
          acceptsEvents = false;
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, refresh, scope.roomId, scope.workspaceId, scopeId, scopeKind]);

  return roomState.rooms;
}
