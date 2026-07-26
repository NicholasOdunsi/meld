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

type FakeDiscoveryStore = {
  rooms: DiscoveryRoom[];
  participants: FakeRoomParticipant[];
  messages: DiscoveryMessage[];
  evidence: FakeEvidence[];
  decisions: FakeDecision[];
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
  };
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
    attachments: [],
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
