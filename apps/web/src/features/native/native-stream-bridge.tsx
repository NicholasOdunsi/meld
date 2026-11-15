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
import { generateDesignScreen } from "@/features/design/design-screen-generation";
import { dismissMessageProposal } from "@/features/rooms/proposals";
import { loadRoomScreen } from "@/features/canvas-excalidraw/load-screen";
import { buildFramePreviewDoc } from "@/features/canvas/screen-preview-doc";
import { previewChromeCss, previewTheme } from "@/features/canvas-next/preview-theme";
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
import { parseDesignMention } from "./design-intent";
import { listRoomScreenFeed, type ScreenFeedRow } from "./screen-feed";

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
  const [screenRows, setScreenRows] = useState<ScreenFeedRow[]>([]);
  const pollerRef = useRef<RoomTaskStatusPoller | null>(null);
  const handledDesignRef = useRef(new Set(initialMessages.map((message) => message.id)));
  const postedDocsRef = useRef(new Set<string>());

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
  const refreshScreens = useCallback(async () => {
    try { setScreenRows(await listRoomScreenFeed(roomId)); } catch { /* The chat remains available. */ }
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
      onStatuses: (statuses) => { setTaskStatuses(statuses); void refreshStars(); void refreshScreens(); },
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
  }, [roomId, refreshStars, refreshScreens]);

  useEffect(() => {
    for (const message of messages) {
      const action = message.proposedAction;
      if (!action || action.kind !== "design_screen" || handledDesignRef.current.has(message.id)) continue;
      handledDesignRef.current.add(message.id);
      void (async () => {
        try {
          const result = await generateDesignScreen({
            roomId,
            ...(action.name ? { name: action.name } : {}),
            instruction: action.instruction,
          });
          if (result.status === "queued") {
            void refreshScreens();
            pollerRef.current?.notifyQueued();
            await dismissMessageProposal(message.id).catch(() => {});
          }
        } catch { /* A failed handoff must not break the stream. */ }
      })();
    }
  }, [messages, roomId, refreshScreens]);

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
        screenRows,
        readiness,
      }),
    [roomId, projectId, currentUser, participants, messages, taskStatuses, starMetadata, constellations, artifacts, screenRows, readiness],
  );

  useEffect(() => {
    postToNative({ v: 1, type: "stream", ...snapshot });
  }, [snapshot]);

  useEffect(() => {
    for (const screen of snapshot.screens) {
      if (screen.state !== "built" || !screen.versionId) continue;
      const key = `${screen.id}:${screen.versionId}`;
      if (postedDocsRef.current.has(key)) continue;
      postedDocsRef.current.add(key);
      void (async () => {
        try {
          const loaded = await loadRoomScreen(roomId, screen.id);
          if (!loaded) throw new Error("missing screen");
          const html = buildFramePreviewDoc(loaded, previewTheme(getComputedStyle(document.body)), previewChromeCss);
          if (!html) throw new Error("missing preview");
          postToNative({ v: 1, type: "screen", roomId, screenId: screen.id,
            versionId: screen.versionId!, formFactor: screen.formFactor, html });
        } catch { postedDocsRef.current.delete(key); }
      })();
    }
  }, [snapshot.screens, roomId]);

  useEffect(() => {
    return registerStreamHandler({
      post: async (input) => {
        const body = input.body.trim();
        if (input.roomId !== roomId || (body.length === 0 && !input.attachmentIds?.length)) return SEND_FAILED;
        try {
          const designBrief = !input.starTaskId && !input.attachmentIds?.length ? parseDesignMention(body) : null;
          if (designBrief) {
            const built = await generateDesignScreen({ roomId, instruction: designBrief });
            if (built.status !== "queued") return { status: "error", message: built.message };
            void refreshScreens();
            pollerRef.current?.notifyQueued();
            return { status: "ok" };
          }
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
  }, [roomId, reconcile, refreshStars, refreshScreens]);

  return null;
}
