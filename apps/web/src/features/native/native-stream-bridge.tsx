"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentReadiness } from "@/features/ai/agent-readiness";
import {
  RoomTaskStatusPoller,
  type RoomTaskStatus,
} from "@/features/ai/room-task-status";
import { discardStagedRoomAttachment, listRoomTaskStatuses, postMessage, stageRoomAttachment } from "@/features/rooms/actions";
import { listRoomStarMetadata, renameRoomConstellation, renameRoomStar, setRoomStarConstellation } from "@/features/rooms/star-actions";
import type { RoomConstellation, RoomStarMetadata } from "@/features/rooms/star-types";
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
  type StreamArtifact,
} from "./bridge";
import { buildStreamSnapshot } from "./stream-snapshot";

const SEND_FAILED: FrameResult = {
  status: "error",
  message: "Orion couldn't send that right now. Try again.",
};
const EMPTY_ARTIFACTS: StreamArtifact[] = [];

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
  artifacts = EMPTY_ARTIFACTS,
}: {
  roomId: string;
  projectId: string;
  currentUser: { id: string; name: string };
  participants: { userId: string; email: string }[];
  initialMessages: RoomMessage[];
  realtimeMode: "production" | "development-poll";
  readiness: AgentReadiness;
  artifacts?: StreamArtifact[];
}) {
  const [messages, setMessages] = useState<RoomMessage[]>(initialMessages);
  const [taskStatuses, setTaskStatuses] = useState<RoomTaskStatus[]>([]);
  const [starMetadata, setStarMetadata] = useState<RoomStarMetadata[]>([]);
  const [constellations, setConstellations] = useState<RoomConstellation[]>([]);
  const pollerRef = useRef<RoomTaskStatusPoller | null>(null);

  const reconcile = useCallback((incoming: RoomMessage) => {
    setMessages((current) => reconcileMessage(current, incoming));
  }, []);
  const refreshStars = useCallback(async () => {
    try {
      const data = await listRoomStarMetadata(roomId);
      setStarMetadata(data.stars);
      setConstellations(data.constellations);
    } catch { /* Task status remains visible if metadata is unavailable. */ }
  }, [roomId]);

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
      onStatuses: (statuses) => { setTaskStatuses(statuses); void refreshStars(); },
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
  }, [roomId, refreshStars]);

  const snapshot = useMemo(
    () =>
      buildStreamSnapshot({
        roomId,
        projectId,
        currentUser,
        participants,
        messages,
        taskStatuses,
        starMetadata,
        constellations,
        artifacts,
        readiness,
      }),
    [roomId, projectId, currentUser, participants, messages, taskStatuses, starMetadata, constellations, artifacts, readiness],
  );

  useEffect(() => {
    postToNative({ v: 1, type: "stream", ...snapshot });
  }, [snapshot]);

  useEffect(() => {
    return registerStreamHandler({
      post: async (input) => {
        const body = input.body.trim();
        if (input.roomId !== roomId || (body.length === 0 && !input.attachmentIds?.length)) return SEND_FAILED;
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
            attachmentIds: input.attachmentIds?.length ? input.attachmentIds : undefined,
            starFollowupOfTaskId: input.starTaskId,
          });
          reconcile(result.message);
          pollerRef.current?.notifyQueued();
          void refreshStars();
          window.setTimeout(() => { void refreshStars(); }, 20_000);
          if (result.agentTask.status === "retryable_error") {
            return { status: "error", message: result.agentTask.message };
          }
          return { status: "ok" };
        } catch {
          return SEND_FAILED;
        }
      },
      stage: async (input) => {
        if (input.roomId !== roomId) return SEND_FAILED;
        try {
          const bytes = Uint8Array.from(atob(input.base64), (character) => character.charCodeAt(0));
          const file = new File([bytes], input.name, { type: input.mimeType });
          const formData = new FormData();
          formData.append("roomId", roomId);
          formData.append("file", file);
          const attachment = await stageRoomAttachment(formData);
          return { status: "ok", path: `/staged/${attachment.id}` };
        } catch {
          return { status: "error", message: "Could not add that file. Try again." };
        }
      },
      discard: async (input) => {
        if (input.roomId !== roomId) return SEND_FAILED;
        try {
          await discardStagedRoomAttachment(input);
          return { status: "ok" };
        } catch {
          return { status: "error", message: "Could not remove that file." };
        }
      },
      renameStar: async (input) => {
        if (input.roomId !== roomId) return SEND_FAILED;
        try {
          await renameRoomStar(input);
          await refreshStars();
          return { status: "ok" };
        } catch { return { status: "error", message: "Could not rename Star." }; }
      },
      setStarConstellation: async (input) => {
        if (input.roomId !== roomId) return SEND_FAILED;
        try {
          await setRoomStarConstellation(input);
          await refreshStars();
          return { status: "ok" };
        } catch { return { status: "error", message: "Could not move Star." }; }
      },
      renameConstellation: async (input) => {
        if (input.roomId !== roomId) return SEND_FAILED;
        try {
          await renameRoomConstellation(input);
          await refreshStars();
          return { status: "ok" };
        } catch { return { status: "error", message: "Could not rename Constellation." }; }
      },
    });
  }, [roomId, reconcile, refreshStars]);

  return null;
}
