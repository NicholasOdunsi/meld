import "server-only";

import { randomUUID } from "node:crypto";
import {
  getFakeOrganizationContext,
  listFakeOrganizationPeople,
} from "@/features/workspaces/e2e-fake";
import type {
  DecisionInput,
  DiscoveryRoomInput,
  EvidenceInput,
  MessageInput,
  ParticipantInput,
} from "./schemas";
import type {
  DiscoveryMessage,
  DiscoveryRoom,
} from "./repository";
import type { DiscoveryAttachmentView } from "./attachment-types";
import { isDiscoveryFakeEnabled } from "./e2e-gate";

type FakeRoomParticipant = {
  roomId: string;
  userId: string;
  access: "view" | "edit";
};

type FakeEvidence = EvidenceInput & {
  id: string;
  createdBy: string;
  createdAt: string;
};

type FakeDecision = DecisionInput & {
  id: string;
  createdBy: string;
  createdAt: string;
};

type FakeDiscoveryAttachment = DiscoveryAttachmentView & {
  roomId: string;
  uploadedBy: string;
};

type FakeDiscoveryStore = {
  rooms: DiscoveryRoom[];
  participants: FakeRoomParticipant[];
  messages: DiscoveryMessage[];
  evidence: FakeEvidence[];
  decisions: FakeDecision[];
  attachments: FakeDiscoveryAttachment[];
};

const FAKE_DISCOVERY_STORE_KEY = Symbol.for(
  "meld.e2e-discovery-store",
);

function getStore() {
  const globalState = globalThis as typeof globalThis & {
    [FAKE_DISCOVERY_STORE_KEY]?: FakeDiscoveryStore;
  };
  globalState[FAKE_DISCOVERY_STORE_KEY] ??= {
    rooms: [],
    participants: [],
    messages: [],
    evidence: [],
    decisions: [],
    attachments: [],
  };
  globalState[FAKE_DISCOVERY_STORE_KEY].attachments ??= [];
  return globalState[FAKE_DISCOVERY_STORE_KEY];
}

async function requireOrganizationMember(organizationId: string) {
  if (!isDiscoveryFakeEnabled()) {
    throw new Error("Development discovery fake is disabled.");
  }
  const context = await getFakeOrganizationContext(organizationId);
  if (!context) throw new Error("Authentication required");
  return context;
}

async function requireParticipant(roomId: string) {
  const room = getStore().rooms.find((candidate) => candidate.id === roomId);
  if (!room) throw new Error("Room not found");
  const context = await requireOrganizationMember(room.organizationId);
  const participant = getStore().participants.find(
    (candidate) =>
      candidate.roomId === roomId &&
      candidate.userId === context.user.id,
  );
  if (!participant) throw new Error("Room participation required");
  return { room, context, participant };
}

async function requireEditor(roomId: string) {
  const result = await requireParticipant(roomId);
  if (result.participant.access !== "edit") {
    throw new Error("Room edit access required");
  }
  return result;
}

function toAttachmentView(
  attachment: FakeDiscoveryAttachment,
): DiscoveryAttachmentView {
  return {
    id: attachment.id,
    messageId: attachment.messageId,
    originalName: attachment.originalName,
    mimeType: attachment.mimeType,
    caption: attachment.caption,
    extractionStatus: attachment.extractionStatus,
    viewUrl: attachment.viewUrl,
  };
}

export async function fakeListRooms(organizationId: string) {
  const context = await requireOrganizationMember(organizationId);
  const participantRoomIds = new Set(
    getStore().participants
      .filter((participant) => participant.userId === context.user.id)
      .map((participant) => participant.roomId),
  );
  return getStore().rooms.filter(
    (room) =>
      room.organizationId === organizationId &&
      participantRoomIds.has(room.id),
  );
}

export async function fakeCreateRoom(input: DiscoveryRoomInput) {
  const context = await requireOrganizationMember(input.organizationId);
  const createdAt = new Date().toISOString();
  const room: DiscoveryRoom = {
    id: randomUUID(),
    organizationId: input.organizationId,
    name: input.name,
    ownerId: context.user.id,
    createdAt,
    lastActivityAt: createdAt,
  };
  getStore().rooms.push(room);
  getStore().participants.push({
    roomId: room.id,
    userId: context.user.id,
    access: "edit",
  });
  return room;
}

export async function fakeAddParticipant(input: ParticipantInput) {
  const { room } = await requireEditor(input.roomId);
  if (input.userId === room.ownerId && input.access !== "edit") {
    throw new Error("Room owner must retain edit access");
  }
  const people = await listFakeOrganizationPeople(room.organizationId);
  if (
    !people?.members.some((member) => member.user_id === input.userId)
  ) {
    throw new Error("Only organization members can join a room");
  }
  const existing = getStore().participants.find(
    (participant) =>
      participant.roomId === input.roomId &&
      participant.userId === input.userId,
  );
  if (existing) {
    existing.access = input.access;
  } else {
    getStore().participants.push({
      roomId: input.roomId,
      userId: input.userId,
      access: input.access,
    });
  }
  return { room_id: input.roomId, user_id: input.userId, access: input.access };
}

export async function fakeRemoveParticipant(
  roomId: string,
  userId: string,
) {
  const { room } = await requireEditor(roomId);
  if (userId === room.ownerId) {
    throw new Error("Room owner participation cannot be removed");
  }
  const participantIndex = getStore().participants.findIndex(
    (participant) =>
      participant.roomId === roomId && participant.userId === userId,
  );
  if (participantIndex < 0) {
    throw new Error("Room participant not found");
  }
  getStore().participants.splice(participantIndex, 1);
}

export async function fakeGetRoom(roomId: string) {
  const { room, context } = await requireParticipant(roomId);
  const people = await listFakeOrganizationPeople(room.organizationId);
  const participants = getStore().participants
    .filter((participant) => participant.roomId === roomId)
    .map((participant) => ({
      ...participant,
      email:
        people?.members.find(
          (member) => member.user_id === participant.userId,
        )?.email ?? "Room participant",
    }));
  return {
    room,
    currentUser: context.user,
    participants,
    members: people?.members ?? [],
    messages: getStore().messages.filter(
      (message) => message.roomId === roomId,
    ),
    evidence: getStore().evidence.filter(
      (item) => item.roomId === roomId,
    ),
    decisions: getStore().decisions.filter(
      (item) => item.roomId === roomId,
    ),
    attachments: getStore().attachments
      .filter((attachment) => attachment.roomId === roomId)
      .map(toAttachmentView),
  };
}

export async function fakeListMessages(roomId: string) {
  await requireParticipant(roomId);
  return getStore().messages.filter(
    (message) => message.roomId === roomId,
  );
}

export async function fakePostMessage(input: MessageInput) {
  const { context } = await requireParticipant(input.roomId);
  const existing = getStore().messages.find(
    (message) =>
      message.roomId === input.roomId &&
      message.clientId === input.clientId,
  );
  if (existing) return existing;
  const message: DiscoveryMessage = {
    id: randomUUID(),
    roomId: input.roomId,
    clientId: input.clientId,
    authorId: context.user.id,
    authorName: context.user.name,
    body: input.body,
    createdAt: new Date().toISOString(),
    delivery: "persisted",
  };
  getStore().messages.push(message);
  return message;
}

export async function fakeStageAttachment(input: {
  roomId: string;
  originalName: string;
  mimeType: string;
  caption: string | null;
  extractionStatus: string;
  bytes: Uint8Array;
}): Promise<DiscoveryAttachmentView> {
  const { context } = await requireParticipant(input.roomId);
  const attachment: FakeDiscoveryAttachment = {
    id: randomUUID(),
    roomId: input.roomId,
    uploadedBy: context.user.id,
    messageId: null,
    originalName: input.originalName,
    mimeType: input.mimeType,
    caption: input.caption,
    extractionStatus: input.extractionStatus,
    viewUrl: input.mimeType.startsWith("image/")
      ? `data:${input.mimeType};base64,${Buffer.from(input.bytes).toString("base64")}`
      : null,
  };
  getStore().attachments.push(attachment);
  return toAttachmentView(attachment);
}

export async function fakeDiscardStagedAttachment(input: {
  roomId: string;
  attachmentId: string;
}) {
  const { context } = await requireParticipant(input.roomId);
  const index = getStore().attachments.findIndex(
    (attachment) =>
      attachment.id === input.attachmentId &&
      attachment.roomId === input.roomId &&
      attachment.uploadedBy === context.user.id &&
      attachment.messageId === null,
  );
  if (index >= 0) {
    getStore().attachments.splice(index, 1);
  }
}

export async function fakeLinkStagedAttachments(input: {
  roomId: string;
  messageId: string;
  attachmentIds: string[];
  caption: string;
}) {
  const { context } = await requireParticipant(input.roomId);
  const message = getStore().messages.find(
    (candidate) =>
      candidate.id === input.messageId &&
      candidate.roomId === input.roomId &&
      candidate.authorId === context.user.id,
  );
  if (!message) return [];

  const requestedIds = new Set(input.attachmentIds);
  const linkedIds: string[] = [];
  for (const attachment of getStore().attachments) {
    if (
      requestedIds.has(attachment.id) &&
      attachment.roomId === input.roomId &&
      attachment.uploadedBy === context.user.id &&
      attachment.messageId === null
    ) {
      attachment.messageId = input.messageId;
      if (attachment.mimeType.startsWith("image/")) {
        attachment.caption = input.caption;
      }
      linkedIds.push(attachment.id);
    }
  }
  return linkedIds;
}

export async function fakeAddEvidence(input: EvidenceInput) {
  const { context } = await requireParticipant(input.roomId);
  const evidence = {
    ...input,
    id: randomUUID(),
    createdBy: context.user.id,
    createdAt: new Date().toISOString(),
  };
  getStore().evidence.push(evidence);
  return evidence;
}

export async function fakeAddDecision(input: DecisionInput) {
  const { context } = await requireParticipant(input.roomId);
  const decision = {
    ...input,
    id: randomUUID(),
    createdBy: context.user.id,
    createdAt: new Date().toISOString(),
  };
  getStore().decisions.push(decision);
  return decision;
}
