import type { AgentReadiness } from "@/features/ai/agent-readiness";
import {
  isTerminalTaskStatus,
  type RoomTaskStatus,
} from "@/features/ai/room-task-status";
import type { RoomMessage } from "@/features/rooms/repository";
import type {
  StreamMessageRow,
  StreamModelChoice,
  StreamSend,
  StreamSnapshot,
} from "./bridge";

export type StreamSnapshotInput = {
  roomId: string;
  projectId: string;
  currentUser: { id: string; name: string };
  participants: { userId: string; email: string }[];
  messages: RoomMessage[];
  taskStatuses: RoomTaskStatus[];
  readiness: AgentReadiness;
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
      createdAt: message.createdAt,
      replyToId:
        isOrion && message.aiTaskId
          ? (sourceByTask.get(message.aiTaskId) ?? null)
          : null,
      delivery: message.delivery,
    };
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
  };
}
