"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getRoomLifecycleSnapshot } from "./actions";
// From ./schemas, not ./stage: ./stage re-exports this schema but also imports
// four Boxicons for the presentation map, which would then be pulled into every
// client bundle that mounts this hook.
import {
  RoomLifecycleRowSchema,
  type RoomLifecycleSnapshot,
} from "./schemas";

export type RoomLifecycleState = RoomLifecycleSnapshot;

type RoomLifecycleScope =
  | { roomId: string; workspaceId?: never }
  | { workspaceId: string; roomId?: never };

function rowToLifecycleState(
  row: ReturnType<typeof RoomLifecycleRowSchema.parse>,
): RoomLifecycleState {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    name: row.name,
    ownerId: row.owner_id,
    stage: row.stage,
    updatedAt: row.updated_at,
  };
}

function isOlder(incoming: string, current: string) {
  const incomingTime = Date.parse(incoming);
  const currentTime = Date.parse(current);
  return (
    Number.isFinite(incomingTime) &&
    Number.isFinite(currentTime) &&
    incomingTime < currentTime
  );
}

export function reconcileRoomLifecycle(
  rooms: RoomLifecycleState[],
  value: unknown,
) {
  const parsed = RoomLifecycleRowSchema.safeParse(value);
  if (!parsed.success) return rooms;
  const incoming = rowToLifecycleState(parsed.data);
  const existing = rooms.find((room) => room.id === incoming.id);
  if (!existing) return rooms;
  if (isOlder(incoming.updatedAt, existing.updatedAt)) return rooms;
  return rooms.map((room) => (room.id === incoming.id ? incoming : room));
}

export function useRoomLifecycleRealtime(
  scope: RoomLifecycleScope,
  initialRooms: RoomLifecycleState[],
  enabled = true,
) {
  const scopeKind = scope.roomId ? "room" : "workspace";
  const scopeId = (scope.roomId ?? scope.workspaceId)!;
  const initialRoomsKey = JSON.stringify(initialRooms);
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
    let active = true;
    let acceptsEvents = false;
    let requiresSnapshot = false;
    let isSubscribed = false;
    let isReconciling = false;
    let connectionEpoch = 0;
    let retryTimer: number | undefined;
    let bufferedRows: unknown[] = [];

    async function reconcileAuthoritativeSnapshot(epoch: number) {
      if (!active || isReconciling) return;
      isReconciling = true;
      try {
        const snapshot = await getRoomLifecycleSnapshot(
          scopeKind === "room"
            ? { roomId: scopeId }
            : { workspaceId: scopeId },
        );
        if (!active || epoch !== connectionEpoch) return;

        let reconciled = snapshot;
        for (const bufferedRow of bufferedRows) {
          reconciled = reconcileRoomLifecycle(reconciled, bufferedRow);
        }
        bufferedRows = [];
        setRoomState((current) => ({
          ...current,
          rooms: reconciled,
        }));
        requiresSnapshot = false;
        acceptsEvents = true;
      } catch {
        if (!active || epoch !== connectionEpoch) return;
        acceptsEvents = false;
        requiresSnapshot = true;
        retryTimer = window.setTimeout(() => {
          retryTimer = undefined;
          void reconcileAuthoritativeSnapshot(connectionEpoch);
        }, 1_000);
      } finally {
        isReconciling = false;
        if (
          active &&
          isSubscribed &&
          requiresSnapshot &&
          retryTimer === undefined
        ) {
          void reconcileAuthoritativeSnapshot(connectionEpoch);
        }
      }
    }

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
          if (!acceptsEvents) {
            bufferedRows.push(event.new);
            return;
          }
          setRoomState((current) => ({
            ...current,
            rooms: reconcileRoomLifecycle(current.rooms, event.new),
          }));
        },
      )
      // A new room changes which rows exist, not a field on a row already in
      // the list, so an in-place reconcile can't place it. Re-read the
      // authoritative snapshot the same way a reconnect does -- that returns
      // the complete, ordered workspace list with the new room included, so it
      // slides into the sidebar without a manual refresh.
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "rooms",
          filter,
        },
        () => {
          requiresSnapshot = true;
          void reconcileAuthoritativeSnapshot(connectionEpoch);
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          isSubscribed = true;
          if (requiresSnapshot || bufferedRows.length > 0) {
            requiresSnapshot = true;
            void reconcileAuthoritativeSnapshot(connectionEpoch);
          } else {
            acceptsEvents = true;
          }
          return;
        }
        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          connectionEpoch += 1;
          isSubscribed = false;
          requiresSnapshot = true;
          acceptsEvents = false;
          if (retryTimer !== undefined) {
            window.clearTimeout(retryTimer);
            retryTimer = undefined;
          }
        }
      });

    return () => {
      active = false;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      void supabase.removeChannel(channel);
    };
  }, [enabled, scope.roomId, scope.workspaceId, scopeId, scopeKind]);

  return roomState.rooms;
}
