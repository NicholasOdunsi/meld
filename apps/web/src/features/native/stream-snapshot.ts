import type { AgentReadiness } from "@/features/ai/agent-readiness";
import {
  isTerminalTaskStatus,
  type RoomTaskStatus,
} from "@/features/ai/room-task-status";
import type { RoomMessage } from "@/features/rooms/repository";
import type { RoomConstellation, RoomStarMetadata } from "@/features/rooms/star-types";
import type {
  StreamArtifact,
  StreamMessageRow,
  StreamStar,
  StreamModelChoice,
  StreamSend,
  StreamSnapshot,
} from "./bridge";
import { linkArtifactsToStars } from "./artifact-inventory";

export type StreamSnapshotInput = {
  roomId: string;
  projectId: string;
  currentUser: { id: string; name: string };
  participants: { userId: string; email: string }[];
  messages: RoomMessage[];
  taskStatuses: RoomTaskStatus[];
  readiness: AgentReadiness;
  starMetadata?: RoomStarMetadata[];
  constellations?: RoomConstellation[];
  artifacts?: StreamArtifact[];
};

const NOT_READY_TEXT = {
  no_device: "Connect a device so Orion can answer.",
  offline: "Your connected device is offline.",
  signed_out: "Sign in to your AI tool on your device, then try again.",
  unsupported: "Your AI tool's version isn't supported yet.",
} as const;

function humanName(
  authorId: string | null,
  currentUser: { id: string; name: string },
  participants: { userId: string; email: string }[],
): string {
  if (authorId && authorId === currentUser.id) return currentUser.name;
  const email = participants.find((p) => p.userId === authorId)?.email;
  const local = email?.split("@")[0];
  return local ? local : "Someone";
}

export function buildStreamSnapshot(input: StreamSnapshotInput): StreamSnapshot {
  const sourceByTask = new Map(
    input.taskStatuses.map((task) => [task.taskId, task.sourceMessageId]),
  );
  const messages: StreamMessageRow[] = input.messages.map((message) => {
    const isOrion = message.authorType !== "human";
    return {
      id: message.id,
      authorKind: isOrion ? "orion" : "human",
      authorId: message.authorId,
      authorName: isOrion
        ? "Orion"
        : humanName(message.authorId, input.currentUser, input.participants),
      text: message.body,
      attachments: message.attachments.map((attachment) => ({
        id: attachment.id,
        name: attachment.originalName,
      })),
      createdAt: message.createdAt,
      replyToId:
        isOrion && message.aiTaskId
          ? (sourceByTask.get(message.aiTaskId) ?? null)
          : null,
      delivery: message.delivery,
      taskId: message.aiTaskId,
    };
  });
  const sourceMessages = new Map(input.messages.map((message) => [message.id, message]));
  const metadataByTask = new Map(input.starMetadata?.map((item) => [item.taskId, item]) ?? []);
  // A follow-up stays attached to its Star: its own reply task is not a new Star.
  const followupMessageIds = new Set(input.starMetadata?.flatMap((item) => item.followupMessageIds) ?? []);
  const stars: StreamStar[] = input.taskStatuses.flatMap((task) => {
    if (task.kind !== "room_reply" || !task.sourceMessageId) return [];
    if (followupMessageIds.has(task.sourceMessageId)) return [];
    const source = sourceMessages.get(task.sourceMessageId);
    const title = source?.body.trim().replace(/\s+/g, " ").slice(0, 80)
      || source?.attachments[0]?.originalName || "Earlier request";
    const status = task.status === "completed" || task.status === "cancelled"
      ? "done" as const
      : task.status === "failed" ? "stuck" as const
      : isTerminalTaskStatus(task.status) ? "needs_you" as const : "working" as const;
    const metadata = metadataByTask.get(task.taskId);
    return [{ id: task.taskId, sourceMessageId: task.sourceMessageId, title: metadata?.title ?? title, status,
      constellation: metadata?.constellation ?? null, createdAt: task.createdAt,
      followupMessageIds: metadata?.followupMessageIds ?? [] }];
  });

  let send: StreamSend;
  let choices: StreamModelChoice[] = [];
  let defaultProvider: string | null = null;
  if (input.readiness.ready) {
    send = { canSend: true };
    defaultProvider = input.readiness.defaultProvider;
    choices = input.readiness.providers.map((entry) => ({
      provider: entry.provider,
      models: entry.models ?? [],
      defaultModel: entry.defaultModel ?? null,
    }));
  } else {
    send = { canSend: false, reason: NOT_READY_TEXT[input.readiness.reason] };
  }

  return {
    roomId: input.roomId,
    projectId: input.projectId,
    currentUserId: input.currentUser.id,
    currentUserName: input.currentUser.name,
    orionBusy: input.taskStatuses.some((task) => !isTerminalTaskStatus(task.status)),
    send,
    defaultProvider,
    choices,
    messages,
    stars,
    artifacts: linkArtifactsToStars(input.artifacts ?? [], stars, messages),
    constellations: input.constellations?.map((item) => item.name) ?? [],
  };
}
