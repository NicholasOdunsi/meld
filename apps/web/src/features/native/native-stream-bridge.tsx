"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentReadiness } from "@/features/ai/agent-readiness";
import {
  RoomTaskStatusPoller,
  type RoomTaskStatus,
} from "@/features/ai/room-task-status";
import { listRoomTaskStatuses, postMessage } from "@/features/rooms/actions";
import { reconcileMessage } from "@/features/rooms/reconcile-message";
import type { RoomMessage } from "@/features/rooms/repository";
import {
  subscribeToDevelopmentRoom,
  subscribeToProductionRoom,
} from "@/features/rooms/room-message-subscription";
import {
  postToNative,
  registerStreamHandler,
  type FrameResult,
} from "./bridge";
import { buildStreamSnapshot } from "./stream-snapshot";

const SEND_FAILED: FrameResult = {
  status: "error",
  message: "Orion couldn't send that right now. Try again.",
};

/**
 * Invisible. Inside the Orion Mac app the project's chat is drawn natively;
 * this keeps the room's messages and Orion's task state fresh (the same
 * realtime subscription and status poller the web chat uses), posts them to
 * the app, and sends what the native composer types as a Product Agent
 * message through the existing `postMessage` action.
 */
export function NativeStreamBridge({
  roomId,
  projectId,
  currentUser,
  participants,
  initialMessages,
  realtimeMode,
  readiness,
}: {
  roomId: string;
  projectId: string;
  currentUser: { id: string; name: string };
  participants: { userId: string; email: string }[];
  initialMessages: RoomMessage[];
  realtimeMode: "production" | "development-poll";
  readiness: AgentReadiness;
}) {
  const [messages, setMessages] = useState<RoomMessage[]>(initialMessages);
  const [taskStatuses, setTaskStatuses] = useState<RoomTaskStatus[]>([]);
  const pollerRef = useRef<RoomTaskStatusPoller | null>(null);

  const reconcile = useCallback((incoming: RoomMessage) => {
    setMessages((current) => reconcileMessage(current, incoming));
  }, []);

  useEffect(() => {
    const unsubscribe =
      realtimeMode === "development-poll"
        ? subscribeToDevelopmentRoom(roomId, reconcile, () => {})
        : subscribeToProductionRoom(roomId, reconcile);
    return unsubscribe;
  }, [realtimeMode, roomId, reconcile]);

  useEffect(() => {
    const poller = new RoomTaskStatusPoller({
      fetchStatuses: () => listRoomTaskStatuses(roomId),
      onStatuses: setTaskStatuses,
      // A failed read (for example revoked access) stops the poll; the chat
      // keeps working and replies still arrive over the subscription.
      onError: () => {},
    });
    pollerRef.current = poller;
    poller.start();
    return () => {
      poller.stop();
      pollerRef.current = null;
    };
  }, [roomId]);

  const snapshot = useMemo(
    () =>
      buildStreamSnapshot({
        roomId,
        projectId,
        currentUser,
        participants,
        messages,
        taskStatuses,
        readiness,
      }),
    [roomId, projectId, currentUser, participants, messages, taskStatuses, readiness],
  );

  useEffect(() => {
    postToNative({ v: 1, type: "stream", ...snapshot });
  }, [snapshot]);

  useEffect(() => {
    return registerStreamHandler({
      post: async (input) => {
        const body = input.body.trim();
        if (input.roomId !== roomId || body.length === 0) return SEND_FAILED;
        try {
          const result = await postMessage({
            roomId,
            clientId: crypto.randomUUID(),
            body,
            mentionedUserIds: [],
            mentionsProductAgent: true,
            agentKind: "product",
            providerOverride: (input.providerOverride ?? undefined) as never,
            modelOverride: (input.modelOverride ?? undefined) as never,
          });
          reconcile(result.message);
          pollerRef.current?.notifyQueued();
          if (result.agentTask.status === "retryable_error") {
            return { status: "error", message: result.agentTask.message };
          }
          return { status: "ok" };
        } catch {
          return SEND_FAILED;
        }
      },
    });
  }, [roomId, reconcile]);

  return null;
}
