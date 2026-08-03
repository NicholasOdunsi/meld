import "server-only";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import type { AITaskStatus } from "@meld/contracts";
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
import type { RoomTaskStatus } from "@/features/ai/room-task-status";
import type { RoomPrd } from "@/features/prd/schemas";
import type { Provider } from "@meld/contracts";
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

// A queued Product Agent reply the fake advances across status polls, standing
// in for the connector: queued -> running -> completed, and on completion it
// inserts one persisted product_agent message the same way Realtime would.
type FakePendingReply = {
  taskId: string;
  roomId: string;
  provider: Provider;
  sourceMessageId: string;
  initiatedBy: string;
  ticks: number;
  done: boolean;
};

// A queued PRD generation the fake advances across status polls, standing in
// for the connector executing create_prd_generate_task: queued -> running ->
// completed, and on completion it materializes exactly one PRD for the room the
// same way the settle trigger would.
type FakePendingPrdGeneration = {
  taskId: string;
  roomId: string;
  provider: Provider;
  initiatedBy: string;
  ticks: number;
  done: boolean;
};

type FakeDiscoveryStore = {
  rooms: DiscoveryRoom[];
  participants: FakeRoomParticipant[];
  messages: DiscoveryMessage[];
  evidence: FakeEvidence[];
  decisions: FakeDecision[];
  attachments: FakeDiscoveryAttachment[];
  taskStatuses: RoomTaskStatus[];
  pendingReplies: FakePendingReply[];
  prds: RoomPrd[];
  pendingPrdGenerations: FakePendingPrdGeneration[];
};

export const E2E_DISCOVERY_ROOM_ID =
  "40000000-0000-4000-8000-000000000001";
const E2E_ORGANIZATION_ID =
  "00000000-0000-4000-8000-000000000001";
const E2E_OWNER_ID = "10000000-0000-4000-8000-000000000001";
const E2E_CREATED_AT = "2026-08-02T10:35:00.000Z";

const FAKE_DISCOVERY_STORE_KEY = Symbol.for(
  "meld.e2e-discovery-store",
);

// The deterministic document the browser regressions read: seeded for the
// pre-existing E2E room (prd-view.spec) and materialized for any room whose
// generation completes (prd-generate.spec). Titles and section labels are the
// assertion surface, so they stay stable.
function buildFakePrd(roomId: string): RoomPrd {
  return {
    id: randomUUID(),
    roomId,
    version: 1,
    status: "draft",
    document: {
      title: "Checkout redesign",
      executiveSummary:
        "Reduce checkout friction while preserving customer trust.",
      problemAndEvidence:
        "Customers abandon checkout when costs appear late.",
      targetUsersAndUseCases:
        "Returning shoppers completing a mobile purchase.",
      goalsNonGoalsAndMetrics:
        "Increase completed checkouts without adding promotions.",
      proposedSolution:
        "Show a concise, transparent order summary throughout checkout.",
      userJourneys:
        "A shopper reviews costs, confirms delivery, and completes payment.",
      functionalRequirements: [
        "Keep the order total visible at every step.",
      ],
      nonFunctionalRequirements: [
        "Preserve keyboard and screen-reader access.",
      ],
      uxStatesAndEdgeCases: [
        "Explain payment failures without losing entered data.",
      ],
      dependenciesAndConstraints: ["Use the existing payments provider."],
      risksAndMitigations: [
        {
          risk: "A denser summary could overwhelm small screens.",
          mitigation: "Progressively disclose secondary order details.",
        },
      ],
      mvpScope: {
        included: ["Mobile checkout summary"],
        excluded: ["New payment methods"],
      },
      acceptanceCriteria: ["The final total is visible before payment."],
      openQuestions: ["Which delivery estimate earns the most trust?"],
      decisionHistory: [],
    },
    ownerId: E2E_OWNER_ID,
    createdBy: E2E_OWNER_ID,
    acceptedAt: null,
    acceptedBy: null,
    createdAt: E2E_CREATED_AT,
    updatedAt: E2E_CREATED_AT,
  };
}

function createFakeDiscoveryStore(): FakeDiscoveryStore {
  return {
    rooms: [
      {
        id: E2E_DISCOVERY_ROOM_ID,
        organizationId: E2E_ORGANIZATION_ID,
        name: "Checkout research",
        ownerId: E2E_OWNER_ID,
        createdAt: E2E_CREATED_AT,
        lastActivityAt: E2E_CREATED_AT,
      },
    ],
    participants: [
      {
        roomId: E2E_DISCOVERY_ROOM_ID,
        userId: E2E_OWNER_ID,
        access: "edit",
      },
    ],
    messages: [],
    evidence: [],
    decisions: [],
    attachments: [],
    taskStatuses: [],
    pendingReplies: [],
    // The pre-existing E2E room ships with a PRD so the view regression has a
    // document to open; freshly created rooms start with none until generation.
    prds: [buildFakePrd(E2E_DISCOVERY_ROOM_ID)],
    pendingPrdGenerations: [],
  };
}

function getStore() {
  const globalState = globalThis as typeof globalThis & {
    [FAKE_DISCOVERY_STORE_KEY]?: FakeDiscoveryStore;
  };
  globalState[FAKE_DISCOVERY_STORE_KEY] ??= createFakeDiscoveryStore();
  globalState[FAKE_DISCOVERY_STORE_KEY].attachments ??= [];
  globalState[FAKE_DISCOVERY_STORE_KEY].taskStatuses ??= [];
  globalState[FAKE_DISCOVERY_STORE_KEY].pendingReplies ??= [];
  globalState[FAKE_DISCOVERY_STORE_KEY].prds ??= [];
  globalState[FAKE_DISCOVERY_STORE_KEY].pendingPrdGenerations ??= [];
  return globalState[FAKE_DISCOVERY_STORE_KEY];
}

// The recovery/attention statuses a spec may seed so the browser can exercise a
// task-state banner end to end (e.g. usage limit -> "Fix connection", failed ->
// "Ask again"). Absent the cookie, a reply settles to completed as normal.
const SEEDABLE_RECOVERY_STATUSES = new Set<AITaskStatus>([
  "needs_reauthentication",
  "usage_limit_reached",
  "needs_review",
  "failed",
]);

async function seededRecoveryStatus(): Promise<AITaskStatus | null> {
  const value = (await cookies()).get("meld-e2e-task-status")?.value as
    | AITaskStatus
    | undefined;
  return value && SEEDABLE_RECOVERY_STATUSES.has(value) ? value : null;
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

export async function fakeDeleteRoom(input: {
  organizationId: string;
  roomId: string;
}) {
  const { room, context } = await requireParticipant(input.roomId);
  if (room.ownerId !== context.user.id) {
    throw new Error("Only the room owner can delete this room.");
  }
  const store = getStore();
  store.rooms = store.rooms.filter((candidate) => candidate.id !== room.id);
  store.participants = store.participants.filter(
    (participant) => participant.roomId !== room.id,
  );
  store.messages = store.messages.filter(
    (message) => message.roomId !== room.id,
  );
  store.evidence = store.evidence.filter(
    (item) => item.roomId !== room.id,
  );
  store.decisions = store.decisions.filter(
    (item) => item.roomId !== room.id,
  );
  store.attachments = store.attachments.filter(
    (attachment) => attachment.roomId !== room.id,
  );
  store.pendingReplies = store.pendingReplies.filter(
    (pending) => pending.roomId !== room.id,
  );
  store.pendingPrdGenerations = store.pendingPrdGenerations.filter(
    (pending) => pending.roomId !== room.id,
  );
  store.prds = store.prds.filter((prd) => prd.roomId !== room.id);
  const remainingTaskIds = new Set([
    ...store.pendingReplies.map((pending) => pending.taskId),
    ...store.pendingPrdGenerations.map((pending) => pending.taskId),
  ]);
  store.taskStatuses = store.taskStatuses.filter((status) =>
    remainingTaskIds.has(status.taskId),
  );
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
    .map((participant) => {
      const member = people?.members.find(
        (candidate) => candidate.user_id === participant.userId,
      );
      return {
        ...participant,
        email: member?.email ?? "Room participant",
        role: member?.role,
        productRole: member?.product_role ?? null,
      };
    });
  return {
    room,
    currentUser: context.user,
    participants,
    members: people?.members ?? [],
    messages: withFakeAttachments(
      getStore().messages.filter(
        (message) => message.roomId === roomId,
      ),
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
  return withFakeAttachments(
    getStore().messages.filter(
      (message) => message.roomId === roomId,
    ),
  );
}

export async function fakeListMessageAttachments(
  roomId: string,
  messageId: string,
): Promise<DiscoveryAttachmentView[]> {
  await requireParticipant(roomId);
  return getStore()
    .attachments.filter(
      (attachment) =>
        attachment.roomId === roomId &&
        attachment.messageId === messageId,
    )
    .map(toAttachmentView);
}

export async function fakePostMessage(input: MessageInput) {
  const { context } = await requireParticipant(input.roomId);
  const store = getStore();
  const existing = store.messages.find(
    (message) =>
      message.roomId === input.roomId &&
      message.clientId === input.clientId,
  );
  if (existing) return existing;

  const requestedIds = [...new Set(input.attachmentIds ?? [])];
  const stagedAttachments = store.attachments.filter(
    (attachment) =>
      requestedIds.includes(attachment.id) &&
      attachment.roomId === input.roomId &&
      attachment.uploadedBy === context.user.id &&
      attachment.messageId === null,
  );
  if (stagedAttachments.length !== requestedIds.length) {
    throw new Error("We could not attach every uploaded file.");
  }

  const message: DiscoveryMessage = {
    id: randomUUID(),
    roomId: input.roomId,
    clientId: input.clientId,
    authorType: "human",
    authorId: context.user.id,
    initiatedBy: null,
    aiTaskId: null,
    provider: null,
    body: input.body,
    citedMessageIds: [],
    citedEvidenceIds: [],
    assumptions: [],
    suggestedNextQuestions: [],
    proposedAction: null,
    attachments: [],
    createdAt: new Date().toISOString(),
    delivery: "persisted",
  };
  store.messages.push(message);
  for (const attachment of stagedAttachments) {
    attachment.messageId = message.id;
    if (attachment.mimeType.startsWith("image/")) {
      const trimmedCaption = input.body.trim();
      if (trimmedCaption.length > 0) {
        attachment.caption = trimmedCaption;
      }
    }
  }
  return message;
}

// Hang each message's linked attachments off it the same way the Supabase
// read path does, so the fake preview shows a file once it is sent.
function withFakeAttachments(
  messages: DiscoveryMessage[],
): DiscoveryMessage[] {
  const attachments = getStore().attachments;
  return messages.map((message) => ({
    ...message,
    attachments: attachments
      .filter((attachment) => attachment.messageId === message.id)
      .map(toAttachmentView),
  }));
}

// Queue a Product Agent reply the same way create_room_reply_task would, but
// against the in-memory store: the human message has already persisted, so this
// only records the queued task and the pending reply the status poll advances.
// Returns the task id, mirroring the real service's shape.
export async function fakeCreateRoomReplyTask(input: {
  roomId: string;
  sourceMessageId: string;
  provider?: Provider;
}): Promise<{ id: string }> {
  const { context } = await requireParticipant(input.roomId);
  const provider: Provider = input.provider ?? "codex";
  const taskId = randomUUID();
  const now = new Date().toISOString();
  getStore().taskStatuses.push({
    taskId,
    sourceMessageId: input.sourceMessageId,
    initiatingUserId: context.user.id,
    provider,
    kind: "room_reply",
    status: "queued",
    createdAt: now,
    updatedAt: now,
  });
  getStore().pendingReplies.push({
    taskId,
    roomId: input.roomId,
    provider,
    sourceMessageId: input.sourceMessageId,
    initiatedBy: context.user.id,
    ticks: 0,
    done: false,
  });
  return { id: taskId };
}

// True once a room has a materialized PRD -- the fake stand-in for the read
// path's hasPrd. No participant check: the page derives this only after
// fakeGetRoom has already authorized the caller.
export function fakeRoomHasPrd(roomId: string): boolean {
  return getStore().prds.some((prd) => prd.roomId === roomId);
}

// The participant-scoped PRD read, mirroring the Supabase backend's getRoomPrd.
export async function fakeGetRoomPrd(
  roomId: string,
): Promise<RoomPrd | null> {
  await requireParticipant(roomId);
  return getStore().prds.find((prd) => prd.roomId === roomId) ?? null;
}

// Queue a PRD generation the same way create_prd_generate_task would, but
// against the in-memory store: it records the queued task and the pending
// generation the status poll advances. Returns the task id, mirroring the real
// RPC's shape.
export async function fakeQueuePrdGeneration(input: {
  roomId: string;
  provider?: Provider;
}): Promise<{ id: string }> {
  const { context } = await requireParticipant(input.roomId);
  const provider: Provider = input.provider ?? "codex";
  const taskId = randomUUID();
  const now = new Date().toISOString();
  getStore().taskStatuses.push({
    taskId,
    sourceMessageId: null,
    initiatingUserId: context.user.id,
    provider,
    kind: "prd_generate",
    status: "queued",
    createdAt: now,
    updatedAt: now,
  });
  getStore().pendingPrdGenerations.push({
    taskId,
    roomId: input.roomId,
    provider,
    initiatedBy: context.user.id,
    ticks: 0,
    done: false,
  });
  return { id: taskId };
}

// The safe, participant-scoped status projection. With no real connector behind
// it, the fake stands in for one: each poll advances a queued reply
// (queued -> running -> completed) and, on completion, inserts exactly one
// persisted product_agent message -- the same path Realtime delivers on. Two
// browser contexts polling the shared store therefore both see the one reply.
export async function fakeListRoomTaskStatuses(
  roomId: string,
): Promise<RoomTaskStatus[]> {
  await requireParticipant(roomId);
  const store = getStore();
  const recoveryStatus = await seededRecoveryStatus();

  for (const pending of store.pendingReplies) {
    if (pending.roomId !== roomId || pending.done) {
      continue;
    }
    const status = store.taskStatuses.find(
      (candidate) => candidate.taskId === pending.taskId,
    );
    if (!status) {
      pending.done = true;
      continue;
    }
    if (pending.ticks === 0) {
      status.status = "running";
      status.updatedAt = new Date().toISOString();
    } else if (recoveryStatus) {
      // A seeded recovery outcome settles to an attention state and posts no
      // reply, so the browser can prove the task-state banner and its action.
      status.status = recoveryStatus;
      status.updatedAt = new Date().toISOString();
      pending.done = true;
    } else {
      status.status = "completed";
      status.updatedAt = new Date().toISOString();
      pending.done = true;
      // When the source message asked for a PRD, the reply proposes generation
      // -- the same proposedAction the connector emits -- so the room can
      // confirm and generate. Any other prompt settles to the plain challenge.
      const sourceBody =
        store.messages.find(
          (message) => message.id === pending.sourceMessageId,
        )?.body ?? "";
      const proposesPrd = /\bprd\b/i.test(sourceBody);
      store.messages.push({
        id: randomUUID(),
        roomId: pending.roomId,
        clientId: randomUUID(),
        authorType: "product_agent",
        authorId: null,
        initiatedBy: pending.initiatedBy,
        aiTaskId: pending.taskId,
        provider: pending.provider,
        body: proposesPrd
          ? "I can turn this room's conversation, evidence, and decisions into a full PRD."
          : "The Product Agent challenges the assumption and asks for the evidence behind it.",
        citedMessageIds: [],
        citedEvidenceIds: [],
        assumptions: [],
        suggestedNextQuestions: [],
        proposedAction: proposesPrd ? { kind: "prd_generate" } : null,
        attachments: [],
        createdAt: new Date().toISOString(),
        delivery: "persisted",
      });
    }
    pending.ticks += 1;
  }

  // Advance any queued PRD generation the same way: queued -> running ->
  // completed, materializing one PRD for the room on completion so the next
  // page load flips hasPrd and getRoomPrd returns the document.
  for (const pending of store.pendingPrdGenerations) {
    if (pending.roomId !== roomId || pending.done) {
      continue;
    }
    const status = store.taskStatuses.find(
      (candidate) => candidate.taskId === pending.taskId,
    );
    if (!status) {
      pending.done = true;
      continue;
    }
    // Stay running for a few polls before completing. Real generation takes
    // 30-60s; the whichever room-status provider is mounted needs to observe
    // the task in flight (and register it as active) so its terminal poll
    // triggers the one router.refresh() that swaps in the materialized
    // document. Completing on the first poll would let a provider see only the
    // terminal state and never refresh.
    if (pending.ticks < 2) {
      status.status = "running";
      status.updatedAt = new Date().toISOString();
    } else {
      status.status = "completed";
      status.updatedAt = new Date().toISOString();
      pending.done = true;
      if (!store.prds.some((prd) => prd.roomId === pending.roomId)) {
        store.prds.push(buildFakePrd(pending.roomId));
      }
    }
    pending.ticks += 1;
  }

  return store.taskStatuses.filter(
    (status) =>
      store.pendingReplies.some(
        (pending) =>
          pending.taskId === status.taskId && pending.roomId === roomId,
      ) ||
      store.pendingPrdGenerations.some(
        (pending) =>
          pending.taskId === status.taskId && pending.roomId === roomId,
      ),
  );
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
        // Mirror link_staged_discovery_attachments: keep the staged caption
        // (the file name) when the message carries no body text.
        const trimmedCaption = input.caption.trim();
        if (trimmedCaption.length > 0) {
          attachment.caption = trimmedCaption;
        }
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
