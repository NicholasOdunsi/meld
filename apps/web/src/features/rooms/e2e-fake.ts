import "server-only";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import type { AITaskStatus } from "@meld/contracts";
import {
  E2E_TEAMMATE_ID,
  E2E_VIEWER_ID,
  getFakeWorkspaceContext,
  fakeWorkspaceHasProject,
  listFakeWorkspacePeople,
} from "@/features/workspaces/e2e-fake";
import type {
  DecisionInput,
  RoomInput,
  EvidenceInput,
  MessageInput,
  MoveRoomInput,
  ParticipantInput,
} from "./schemas";
import type { RoomTaskStatus } from "@/features/ai/room-task-status";
import {
  PRDDocumentSchema,
  type PRDDocument,
} from "@meld/contracts";
import {
  PrdAcceptForbiddenError,
  PrdAlreadyAcceptedError,
  PrdEditForbiddenError,
  InvalidPrdDocumentError,
  PrdVersionConflictError,
} from "@/features/prd/repository";
import type {
  PrdAssistRequest,
  PrdProposal,
  RoomPrd,
} from "@/features/prd/schemas";
import type {
  AgentKind,
  PrdAssistScopeSection,
  Provider,
  ResearchScope,
  TaskErrorCode,
} from "@meld/contracts";
import type {
  RoomMessage,
  RoomPrdContext,
  Room,
} from "./repository";
import type { RoomAttachmentView } from "./attachment-types";
import { isRoomFakeEnabled } from "./e2e-gate";

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

type FakeRoomAttachment = RoomAttachmentView & {
  roomId: string;
  uploadedBy: string;
};

type FakeUserFlowLifecycle = {
  roomId: string;
  createdBy: string;
  createdAt: string;
};

// A queued Product Agent reply the fake advances across status polls, standing
// in for the connector: queued -> running -> completed, and on completion it
// inserts one persisted product_agent message the same way Realtime would.
type FakePendingReply = {
  taskId: string;
  roomId: string;
  provider: Provider;
  agentKind: AgentKind;
  researchScope: ResearchScope;
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

type FakePendingPrdSectionRevision = {
  taskId: string;
  roomId: string;
  provider: Provider;
  initiatedBy: string;
  proposalId: string;
  ticks: number;
  done: boolean;
};

type FakePendingPrdAssist = {
  taskId: string;
  roomId: string;
  provider: Provider;
  initiatedBy: string;
  requestId: string;
  ticks: number;
  done: boolean;
};

type FakeRoomStore = {
  rooms: Room[];
  participants: FakeRoomParticipant[];
  messages: RoomMessage[];
  evidence: FakeEvidence[];
  decisions: FakeDecision[];
  attachments: FakeRoomAttachment[];
  taskStatuses: RoomTaskStatus[];
  pendingReplies: FakePendingReply[];
  prds: RoomPrd[];
  pendingPrdGenerations: FakePendingPrdGeneration[];
  proposals: PrdProposal[];
  pendingPrdSectionRevisions: FakePendingPrdSectionRevision[];
  assistRequests: PrdAssistRequest[];
  pendingPrdAssists: FakePendingPrdAssist[];
  userFlows: FakeUserFlowLifecycle[];
};

export const E2E_DISCOVERY_ROOM_ID =
  "40000000-0000-4000-8000-000000000001";
const E2E_WORKSPACE_ID =
  "00000000-0000-4000-8000-000000000001";
const E2E_PROJECT_ID =
  "20000000-0000-4000-8000-000000000001";
const E2E_OWNER_ID = "10000000-0000-4000-8000-000000000001";
const E2E_CREATED_AT = "2026-08-02T10:35:00.000Z";

const FAKE_DISCOVERY_STORE_KEY = Symbol.for(
  "meld.e2e-room-store",
);

// The deterministic document the browser regressions read: seeded for the
// pre-existing E2E room (prd-view.spec) and materialized for any room whose
// generation completes (prd-generate.spec). Titles and section labels are the
// assertion surface, so they stay stable.
function buildFakePrd(roomId: string, ownerId: string): RoomPrd {
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
    ownerId,
    createdBy: ownerId,
    acceptedAt: null,
    acceptedBy: null,
    createdAt: E2E_CREATED_AT,
    updatedAt: E2E_CREATED_AT,
  };
}

function createFakeRoomStore(): FakeRoomStore {
  return {
    rooms: [
      {
        id: E2E_DISCOVERY_ROOM_ID,
        workspaceId: E2E_WORKSPACE_ID,
        projectId: E2E_PROJECT_ID,
        name: "Checkout research",
        ownerId: E2E_OWNER_ID,
        stage: "discovery",
        createdAt: E2E_CREATED_AT,
        lastActivityAt: E2E_CREATED_AT,
        updatedAt: E2E_CREATED_AT,
      },
    ],
    participants: [
      {
        roomId: E2E_DISCOVERY_ROOM_ID,
        userId: E2E_OWNER_ID,
        access: "edit",
      },
      // A second editor and a view-only participant, seeded because nothing in
      // the product adds a room participant today. They are what lets the
      // browser prove the two halves the design turns on: a shared exchange is
      // visible to every participant, and asking is open to a view-only one
      // while producing or applying a proposal is not.
      {
        roomId: E2E_DISCOVERY_ROOM_ID,
        userId: E2E_TEAMMATE_ID,
        access: "edit",
      },
      {
        roomId: E2E_DISCOVERY_ROOM_ID,
        userId: E2E_VIEWER_ID,
        access: "view",
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
    prds: [buildFakePrd(E2E_DISCOVERY_ROOM_ID, E2E_OWNER_ID)],
    pendingPrdGenerations: [],
    proposals: [],
    pendingPrdSectionRevisions: [],
    assistRequests: [],
    pendingPrdAssists: [],
    userFlows: [
      {
        roomId: E2E_DISCOVERY_ROOM_ID,
        createdBy: E2E_OWNER_ID,
        createdAt: E2E_CREATED_AT,
      },
    ],
  };
}

function getStore() {
  const globalState = globalThis as typeof globalThis & {
    [FAKE_DISCOVERY_STORE_KEY]?: FakeRoomStore;
  };
  globalState[FAKE_DISCOVERY_STORE_KEY] ??= createFakeRoomStore();
  globalState[FAKE_DISCOVERY_STORE_KEY].attachments ??= [];
  globalState[FAKE_DISCOVERY_STORE_KEY].taskStatuses ??= [];
  globalState[FAKE_DISCOVERY_STORE_KEY].pendingReplies ??= [];
  globalState[FAKE_DISCOVERY_STORE_KEY].prds ??= [];
  globalState[FAKE_DISCOVERY_STORE_KEY].pendingPrdGenerations ??= [];
  globalState[FAKE_DISCOVERY_STORE_KEY].proposals ??= [];
  globalState[FAKE_DISCOVERY_STORE_KEY].pendingPrdSectionRevisions ??= [];
  globalState[FAKE_DISCOVERY_STORE_KEY].assistRequests ??= [];
  globalState[FAKE_DISCOVERY_STORE_KEY].pendingPrdAssists ??= [];
  globalState[FAKE_DISCOVERY_STORE_KEY].userFlows ??= [];
  return globalState[FAKE_DISCOVERY_STORE_KEY];
}

// The recovery/attention statuses a spec may seed so the browser can exercise a
// task-state banner end to end (e.g. usage limit -> "Fix connection", failed ->
// "Ask again"). Absent the cookie, a reply settles to completed as normal.
type SeedableRecoveryStatus =
  | "needs_reauthentication"
  | "usage_limit_reached"
  | "needs_review"
  | "failed";

const SEEDABLE_RECOVERY_STATUSES = new Set<AITaskStatus>([
  "needs_reauthentication",
  "usage_limit_reached",
  "needs_review",
  "failed",
] satisfies SeedableRecoveryStatus[]);

async function seededRecoveryStatus(): Promise<SeedableRecoveryStatus | null> {
  const value = (await cookies()).get("meld-e2e-task-status")?.value as
    | AITaskStatus
    | undefined;
  return value && SEEDABLE_RECOVERY_STATUSES.has(value)
    ? (value as SeedableRecoveryStatus)
    : null;
}

async function requireWorkspaceMember(workspaceId: string) {
  if (!isRoomFakeEnabled()) {
    throw new Error("Development room fake is disabled.");
  }
  const context = await getFakeWorkspaceContext(workspaceId);
  if (!context) throw new Error("Authentication required");
  return context;
}

async function requireParticipant(roomId: string) {
  const room = getStore().rooms.find((candidate) => candidate.id === roomId);
  if (!room) throw new Error("Room not found");
  const context = await requireWorkspaceMember(room.workspaceId);
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
  attachment: FakeRoomAttachment,
): RoomAttachmentView {
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

export async function fakeListRooms(workspaceId: string) {
  const context = await requireWorkspaceMember(workspaceId);
  const participantRoomIds = new Set(
    getStore().participants
      .filter((participant) => participant.userId === context.user.id)
      .map((participant) => participant.roomId),
  );
  return getStore().rooms.filter(
    (room) =>
      room.workspaceId === workspaceId &&
      participantRoomIds.has(room.id),
  );
}

export async function fakeCreateRoom(input: RoomInput) {
  const context = await requireWorkspaceMember(input.workspaceId);
  if (!fakeWorkspaceHasProject(input.workspaceId, input.projectId)) {
    throw new Error("Project does not belong to the workspace");
  }
  const createdAt = new Date().toISOString();
  const room: Room = {
    id: randomUUID(),
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    name: input.name,
    ownerId: context.user.id,
    stage: "discovery",
    createdAt,
    lastActivityAt: createdAt,
    updatedAt: createdAt,
  };
  getStore().rooms.push(room);
  getStore().participants.push({
    roomId: room.id,
    userId: context.user.id,
    access: "edit",
  });
  return room;
}

export async function fakeSetRoomStage(input: {
  roomId: string;
  stage: Room["stage"];
}) {
  const { room, context } = await requireParticipant(input.roomId);
  if (
    room.ownerId !== context.user.id &&
    context.membership.role !== "admin"
  ) {
    throw new Error("Room stage access required");
  }
  if (room.stage === input.stage) return room.stage;
  room.stage = input.stage;
  room.updatedAt = new Date().toISOString();
  return room.stage;
}

export async function fakeStartUserFlow(
  roomId: string,
): Promise<FakeUserFlowLifecycle> {
  const { context } = await requireEditor(roomId);
  const existing = getStore().userFlows.find(
    (flow) => flow.roomId === roomId,
  );
  if (existing) return existing;

  const lifecycle = {
    roomId,
    createdBy: context.user.id,
    createdAt: new Date().toISOString(),
  };
  getStore().userFlows.push(lifecycle);
  return lifecycle;
}

export function fakeRoomHasUserFlow(roomId: string): boolean {
  return getStore().userFlows.some((flow) => flow.roomId === roomId);
}

export async function fakeMoveRoom(input: MoveRoomInput) {
  const room = getStore().rooms.find(
    (candidate) => candidate.id === input.roomId,
  );
  if (!room) throw new Error("Room not found");
  const context = await requireWorkspaceMember(room.workspaceId);
  const isParticipant = getStore().participants.some(
    (candidate) =>
      candidate.roomId === room.id &&
      candidate.userId === context.user.id,
  );
  if (
    !isParticipant ||
    (
      room.ownerId !== context.user.id &&
      context.membership.role !== "admin"
    )
  ) {
    throw new Error("Room move access required");
  }
  if (room.projectId === input.projectId) return room.projectId;
  if (!fakeWorkspaceHasProject(room.workspaceId, input.projectId)) {
    throw new Error("Target Project must belong to the Room workspace");
  }

  const previousUpdatedAt = Date.parse(room.updatedAt);
  room.projectId = input.projectId;
  room.updatedAt = new Date(
    Math.max(Date.now(), previousUpdatedAt + 1),
  ).toISOString();
  return room.projectId;
}

export function fakeProjectHasRooms(projectId: string): boolean {
  return getStore().rooms.some((room) => room.projectId === projectId);
}

export async function fakeDeleteRoom(input: {
  workspaceId: string;
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
  store.pendingPrdSectionRevisions = store.pendingPrdSectionRevisions.filter(
    (pending) => pending.roomId !== room.id,
  );
  store.pendingPrdAssists = store.pendingPrdAssists.filter(
    (pending) => pending.roomId !== room.id,
  );
  store.prds = store.prds.filter((prd) => prd.roomId !== room.id);
  store.userFlows = store.userFlows.filter(
    (flow) => flow.roomId !== room.id,
  );
  store.proposals = store.proposals.filter(
    (proposal) => proposal.roomId !== room.id,
  );
  store.assistRequests = store.assistRequests.filter(
    (request) => request.roomId !== room.id,
  );
  const remainingTaskIds = new Set([
    ...store.pendingReplies.map((pending) => pending.taskId),
    ...store.pendingPrdGenerations.map((pending) => pending.taskId),
    ...store.pendingPrdSectionRevisions.map((pending) => pending.taskId),
    ...store.pendingPrdAssists.map((pending) => pending.taskId),
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
  const people = await listFakeWorkspacePeople(room.workspaceId);
  if (
    !people?.members.some((member) => member.user_id === input.userId)
  ) {
    throw new Error("Only workspace members can join a room");
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
  const people = await listFakeWorkspacePeople(room.workspaceId);
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
    isCurrentUserWorkspaceAdmin: context.membership.role === "admin",
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
): Promise<RoomAttachmentView[]> {
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

  const message: RoomMessage = {
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
    kind: "conversation",
    prdContext: null,
    prdChange: null,
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
  messages: RoomMessage[],
): RoomMessage[] {
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
  model?: string;
  agentKind?: AgentKind;
  researchScope?: ResearchScope;
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
    agentKind: input.agentKind ?? "product",
    status: "queued",
    createdAt: now,
    updatedAt: now,
  });
  getStore().pendingReplies.push({
    taskId,
    roomId: input.roomId,
    provider,
    agentKind: input.agentKind ?? "product",
    researchScope: input.researchScope ?? "room",
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
  return getLatestFakePrd(roomId);
}

export async function fakeListRoomPrdHistory(
  roomId: string,
): Promise<RoomPrd[]> {
  await requireParticipant(roomId);
  return getStore()
    .prds.filter((prd) => prd.roomId === roomId)
    .toSorted((a, b) => b.version - a.version);
}

export async function fakeSaveRoomPrdVersion(input: {
  roomId: string;
  baseVersion: number;
  document: PRDDocument;
}): Promise<RoomPrd> {
  let editor: Awaited<ReturnType<typeof requireEditor>>;
  try {
    editor = await requireEditor(input.roomId);
  } catch {
    throw new PrdEditForbiddenError();
  }
  const document = PRDDocumentSchema.safeParse(input.document);
  if (!document.success) throw new InvalidPrdDocumentError();

  const { room, context } = editor;
  const currentVersion = getLatestFakePrd(input.roomId)?.version ?? 0;
  if (input.baseVersion !== currentVersion) {
    throw new PrdVersionConflictError(currentVersion);
  }

  const now = new Date().toISOString();
  const prd: RoomPrd = {
    id: randomUUID(),
    roomId: input.roomId,
    version: currentVersion + 1,
    status: "draft",
    document: document.data,
    ownerId: room.ownerId,
    createdBy: context.user.id,
    acceptedAt: null,
    acceptedBy: null,
    createdAt: now,
    updatedAt: now,
  };
  getStore().prds.push(prd);
  return prd;
}

export async function fakeAcceptRoomPrdVersion(input: {
  roomId: string;
  prdId: string;
}): Promise<RoomPrd> {
  const prd = getStore().prds.find(
    (candidate) =>
      candidate.id === input.prdId && candidate.roomId === input.roomId,
  );
  if (!prd) throw new PrdAlreadyAcceptedError();

  const room = getStore().rooms.find((candidate) => candidate.id === prd.roomId);
  if (!room) throw new PrdAlreadyAcceptedError();
  const context = await requireWorkspaceMember(room.workspaceId);
  if (
    context.user.id !== room.ownerId &&
    context.membership.role !== "admin"
  ) {
    throw new PrdAcceptForbiddenError();
  }

  if (prd.status === "accepted") return prd;
  if (prd.status !== "draft") throw new PrdAlreadyAcceptedError();

  prd.status = "accepted";
  prd.acceptedAt = new Date().toISOString();
  prd.acceptedBy = context.user.id;
  prd.updatedAt = prd.acceptedAt;
  return prd;
}

function getLatestFakePrd(roomId: string): RoomPrd | null {
  return getStore()
    .prds.filter((prd) => prd.roomId === roomId)
    .reduce<RoomPrd | null>(
      (latest, prd) => (!latest || prd.version > latest.version ? prd : latest),
      null,
    );
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
    agentKind: "product",
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

function fakeSectionRevisionValue(
  field: PrdProposal["sectionField"],
  previous: unknown,
  instruction: string,
): unknown {
  const note = `Product Agent revision: ${instruction}`;
  if (typeof previous === "string") return `${previous} ${note}`;
  if (Array.isArray(previous)) {
    if (field === "risksAndMitigations") {
      return [
        ...previous,
        { risk: instruction, mitigation: "Validate this change with the team." },
      ];
    }
    if (field === "mvpScope") return previous;
    if (field === "decisionHistory") {
      return [
        ...previous,
        { decision: instruction, rationale: "Proposed by the Product Agent.", sourceMessageIds: [] },
      ];
    }
    return [...previous, note];
  }
  if (
    previous &&
    typeof previous === "object" &&
    field === "mvpScope"
  ) {
    const scope = previous as { included: string[]; excluded: string[] };
    return { ...scope, included: [...scope.included, instruction] };
  }
  return previous;
}

export async function fakeQueuePrdSectionRevision(input: {
  roomId: string;
  field: string;
  sectionLabel: string;
  instruction: string;
  quotedText: string | null;
  provider?: Provider;
}): Promise<{ id: string; status: "queued" }> {
  const { context } = await requireParticipant(input.roomId);
  const prd = getLatestFakePrd(input.roomId);
  if (!prd) throw new Error("There is no PRD to revise.");
  const taskId = randomUUID();
  const proposalId = randomUUID();
  const now = new Date().toISOString();
  const provider = input.provider ?? "codex";
  const proposal: PrdProposal = {
    id: proposalId,
    roomId: input.roomId,
    taskId,
    provider,
    basePrdId: prd.id,
    baseVersion: prd.version,
    sectionField: input.field,
    sectionLabel: input.sectionLabel,
    instruction: input.instruction,
    quotedText: input.quotedText,
    previousValue: prd.document[input.field as keyof PRDDocument],
    proposedValue: null,
    status: "pending",
    errorMessage: null,
    createdBy: context.user.id,
    createdAt: now,
    updatedAt: now,
    appliedAt: null,
    discardedAt: null,
  };
  const store = getStore();
  store.proposals.push(proposal);
  store.taskStatuses.push({
    taskId,
    sourceMessageId: null,
    initiatingUserId: context.user.id,
    provider,
    kind: "prd_section_revise",
    agentKind: "product",
    status: "queued",
    createdAt: now,
    updatedAt: now,
  });
  store.pendingPrdSectionRevisions.push({
    taskId,
    roomId: input.roomId,
    provider,
    initiatedBy: context.user.id,
    proposalId,
    ticks: 0,
    done: false,
  });
  return { id: taskId, status: "queued" };
}

// The seven fixture phrases the browser regressions type, each pinned to one of
// the four outcomes. This table exists ONLY in the fake. Production never inspects an
// instruction: deciding whether a request is a question, an edit, both, or too
// ambiguous to act on is the Product Agent's job, and a hand-written rule on
// this side would be a second, unreviewed classifier sitting in front of it.
type FakeAssistOutcome = "answer" | "edit" | "answer_and_edit" | "clarification";

const FAKE_ASSIST_FIXTURES = new Map<string, FakeAssistOutcome>([
  ["Why did we choose this?", "answer"],
  // A question across several selected sections. Pinned rather than left to
  // the fallback below, so the multi-section question scenario proves an
  // answer was chosen over the other three outcomes rather than proving what
  // an unrecognized phrase happens to do.
  ["Why are we going in this direction?", "answer"],
  ["Rewrite this for small teams.", "edit"],
  ["Rewrite the Proposed solution for small teams.", "edit"],
  ["Explain this and make the rationale clearer.", "answer_and_edit"],
  ["Fix this.", "clarification"],
  ["Rewrite both.", "clarification"],
]);

// The provider an assist request lands on when the composer names none.
const FAKE_DEFAULT_ASSIST_PROVIDER: Provider = "codex";

// The public-safe reason a seeded recovery status leaves on the request, the
// same way the real materializer copies a task's error code across.
const FAKE_ASSIST_ERROR_CODES: Record<SeedableRecoveryStatus, TaskErrorCode> = {
  needs_reauthentication: "authentication_required",
  usage_limit_reached: "usage_limit_reached",
  needs_review: "malformed_output",
  failed: "unknown",
};

const FAKE_ASSIST_ANSWER =
  "The Product Agent explains the tradeoff behind this section and cites the room's evidence.";
const FAKE_ASSIST_CLARIFICATION =
  "Which part of this section should I change first?";
// A scope of several sections has a different ambiguity to resolve: the design
// says a request to change more than one selected section asks which section
// comes first rather than picking one.
const FAKE_ASSIST_MULTI_SECTION_CLARIFICATION =
  "Which section should I change first?";

export async function fakeAssistPrdSection(input: {
  roomId: string;
  clientRequestId: string;
  sections: PrdAssistScopeSection[];
  instruction: string;
  provider?: Provider;
}): Promise<{ taskId: string; requestId: string }> {
  const { context, participant } = await requireParticipant(input.roomId);
  const store = getStore();
  // Idempotent on (room, client request id), like the RPC: a resubmission
  // returns the first call's ids and queues nothing.
  const existing = store.assistRequests.find(
    (request) =>
      request.roomId === input.roomId &&
      request.clientRequestId === input.clientRequestId,
  );
  if (existing) {
    return { taskId: existing.taskId, requestId: existing.id };
  }

  const prd = getLatestFakePrd(input.roomId);
  if (!prd) throw new Error("There is no PRD to ask about.");
  const taskId = randomUUID();
  const now = new Date().toISOString();
  const provider = input.provider ?? FAKE_DEFAULT_ASSIST_PROVIDER;
  const request: PrdAssistRequest = {
    id: randomUUID(),
    roomId: input.roomId,
    taskId,
    clientRequestId: input.clientRequestId,
    basePrdId: prd.id,
    baseVersion: prd.version,
    selectedSections: input.sections,
    instruction: input.instruction,
    // Frozen from room access at submission, never asked of the client.
    canProposeEdit: participant.access === "edit",
    status: "pending",
    answer: null,
    clarifyingQuestion: null,
    citedMessageIds: [],
    citedEvidenceIds: [],
    assumptions: [],
    suggestedNextQuestions: [],
    proposalId: null,
    proposalErrorCode: null,
    errorCode: null,
    questionMessageId: null,
    answerMessageId: null,
    provider,
    taskStatus: "queued",
    createdBy: context.user.id,
    createdAt: now,
    updatedAt: now,
    settledAt: null,
  };
  store.assistRequests.push(request);
  store.taskStatuses.push({
    taskId,
    sourceMessageId: null,
    initiatingUserId: context.user.id,
    provider,
    kind: "prd_section_assist",
    agentKind: "product",
    status: "queued",
    createdAt: now,
    updatedAt: now,
  });
  store.pendingPrdAssists.push({
    taskId,
    roomId: input.roomId,
    provider,
    initiatedBy: context.user.id,
    requestId: request.id,
    ticks: 0,
    done: false,
  });
  return { taskId, requestId: request.id };
}

export async function fakeGetPrdAssistRequest(input: {
  roomId: string;
  requestId: string;
}): Promise<PrdAssistRequest | null> {
  await requireParticipant(input.roomId);
  return (
    getStore().assistRequests.find(
      (request) =>
        request.id === input.requestId && request.roomId === input.roomId,
    ) ?? null
  );
}

export async function fakeListRoomPrdAssistRequests(input: {
  roomId: string;
}): Promise<PrdAssistRequest[]> {
  const { context } = await requireParticipant(input.roomId);
  return getStore()
    .assistRequests.filter(
      (request) =>
        request.roomId === input.roomId &&
        request.createdBy === context.user.id &&
        request.status !== "dismissed",
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

// Mirrors dismiss_prd_assist_request: only the creator, and only once the
// request has settled -- a pending one is still going to produce a result.
export async function fakeDismissPrdAssistRequest(input: {
  roomId: string;
  requestId: string;
}): Promise<void> {
  const { context } = await requireParticipant(input.roomId);
  const request = getStore().assistRequests.find(
    (candidate) =>
      candidate.id === input.requestId && candidate.roomId === input.roomId,
  );
  if (
    !request ||
    request.createdBy !== context.user.id ||
    (request.status !== "ready" && request.status !== "failed")
  ) {
    throw new Error("The PRD request is no longer dismissable.");
  }
  request.status = "dismissed";
  request.updatedAt = new Date().toISOString();
}

export async function fakeListRoomPrdProposals(
  roomId: string,
): Promise<PrdProposal[]> {
  await requireParticipant(roomId);
  return getStore().proposals.filter(
    (proposal) =>
      proposal.roomId === roomId &&
      (proposal.status === "pending" ||
        proposal.status === "ready" ||
        proposal.status === "failed"),
  ).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function fakeApplyPrdProposal(input: {
  roomId: string;
  proposalId: string;
}): Promise<RoomPrd> {
  const { context } = await requireParticipant(input.roomId);
  const store = getStore();
  const proposal = store.proposals.find(
    (candidate) =>
      candidate.id === input.proposalId && candidate.roomId === input.roomId,
  );
  const current = getLatestFakePrd(input.roomId);
  if (!proposal || proposal.status !== "ready" || !current) {
    throw new Error("The PRD proposal is no longer ready.");
  }
  if (current.version !== proposal.baseVersion) {
    throw new Error("The PRD changed while this proposal was being reviewed.");
  }
  const document = {
    ...current.document,
    [proposal.sectionField]: proposal.proposedValue,
  } as PRDDocument;
  const now = new Date().toISOString();
  const next: RoomPrd = {
    ...current,
    id: randomUUID(),
    version: current.version + 1,
    document,
    createdBy: context.user.id,
    createdAt: now,
    updatedAt: now,
  };
  store.prds.push(next);
  proposal.status = "applied";
  proposal.appliedAt = now;
  proposal.updatedAt = now;
  // Acceptance, not attempt, is what Conversation records: exactly one compact
  // entry per applied proposal, carrying the frozen section and the change
  // itself so the room can read what landed. Discarding writes nothing.
  const originatingRequest = store.assistRequests.find(
    (candidate) => candidate.proposalId === proposal.id,
  );
  store.messages.push({
    id: randomUUID(),
    roomId: input.roomId,
    clientId: proposal.id,
    authorType: "human",
    authorId: context.user.id,
    initiatedBy: null,
    aiTaskId: null,
    provider: null,
    body: `Applied a Product Agent edit to ${proposal.sectionLabel}.`,
    citedMessageIds: [],
    citedEvidenceIds: [],
    assumptions: [],
    suggestedNextQuestions: [],
    proposedAction: null,
    kind: "prd_change",
    prdContext: {
      prdId: next.id,
      version: next.version,
      sections: [
        {
          field: proposal.sectionField,
          label: proposal.sectionLabel,
          // apply_prd_proposal copies a nullable quoted_text straight into the
          // frozen context, and mapRoomMessageRow reads that JSON null
          // back as "". The fake stores already-mapped messages, so it writes
          // the same "" rather than a shape the mapper would never hand out.
          quotedText: proposal.quotedText ?? "",
        },
      ],
      assistRequestId: originatingRequest?.id ?? null,
      proposalId: proposal.id,
    },
    prdChange: {
      instruction: proposal.instruction,
      previousValue: proposal.previousValue,
      proposedValue: proposal.proposedValue,
    },
    attachments: [],
    createdAt: now,
    delivery: "persisted",
  });
  return next;
}

export async function fakeDiscardPrdProposal(input: {
  roomId: string;
  proposalId: string;
}): Promise<PrdProposal> {
  await requireParticipant(input.roomId);
  const proposal = getStore().proposals.find(
    (candidate) =>
      candidate.id === input.proposalId && candidate.roomId === input.roomId,
  );
  if (!proposal || !["pending", "ready"].includes(proposal.status)) {
    throw new Error("The PRD proposal is no longer discardable.");
  }
  proposal.status = "discarded";
  proposal.discardedAt = new Date().toISOString();
  proposal.updatedAt = proposal.discardedAt;
  return proposal;
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
      // When a PRD already exists, a "prd" prompt is an update request, so the
      // reply offers a revision rather than a fresh generation -- mirroring the
      // connector's existingPrd-aware proposedAction choice.
      const revisesPrd = proposesPrd && fakeRoomHasPrd(pending.roomId);
      store.messages.push({
        id: randomUUID(),
        roomId: pending.roomId,
        clientId: randomUUID(),
        authorType:
          pending.agentKind === "research"
            ? "research_agent"
            : "product_agent",
        authorId: null,
        initiatedBy: pending.initiatedBy,
        aiTaskId: pending.taskId,
        provider: pending.provider,
        body:
          pending.agentKind === "research"
            ? pending.researchScope === "web"
              ? "The external evidence points to a comparable pattern, with sources attached."
              : "The room evidence supports one observation and leaves a clear research gap."
            : revisesPrd
              ? "I can update the existing PRD with the change you described."
              : proposesPrd
                ? "I can turn this room's conversation, evidence, and decisions into a full PRD."
                : "The Product Agent challenges the assumption and asks for the evidence behind it.",
        citedMessageIds: [],
        citedEvidenceIds: [],
        assumptions: [],
        suggestedNextQuestions: [],
        webSources:
          pending.agentKind === "research" && pending.researchScope === "web"
            ? [
                {
                  title: "Example research source",
                  url: "https://example.com/research",
                  publisher: "Example",
                  publishedAt: null,
                },
              ]
            : [],
        proposedAction:
          pending.agentKind === "research"
            ? null
            : revisesPrd
              ? { kind: "prd_revise" }
              : proposesPrd
                ? { kind: "prd_generate" }
                : null,
        kind: "conversation",
        prdContext: null,
        prdChange: null,
        attachments: [],
        createdAt: new Date().toISOString(),
        delivery: "persisted",
      });
    }
    pending.ticks += 1;
  }

  for (const pending of store.pendingPrdSectionRevisions) {
    if (pending.roomId !== roomId || pending.done) continue;
    const status = store.taskStatuses.find(
      (candidate) => candidate.taskId === pending.taskId,
    );
    const proposal = store.proposals.find(
      (candidate) => candidate.id === pending.proposalId,
    );
    if (!status || !proposal) {
      pending.done = true;
      continue;
    }
    if (pending.ticks === 0) {
      status.status = "running";
      status.updatedAt = new Date().toISOString();
    } else {
      const now = new Date().toISOString();
      status.status = "completed";
      status.updatedAt = now;
      proposal.proposedValue = fakeSectionRevisionValue(
        proposal.sectionField,
        proposal.previousValue,
        proposal.instruction,
      );
      proposal.status = "ready";
      proposal.updatedAt = now;
      pending.done = true;
    }
    pending.ticks += 1;
  }

  // Advance a queued assist request the same way, standing in for the
  // materializer: the second poll settles it into whichever of the four
  // outcomes its fixture phrase names.
  for (const pending of store.pendingPrdAssists) {
    if (pending.roomId !== roomId || pending.done) continue;
    const status = store.taskStatuses.find(
      (candidate) => candidate.taskId === pending.taskId,
    );
    const request = store.assistRequests.find(
      (candidate) => candidate.id === pending.requestId,
    );
    if (!status || !request) {
      pending.done = true;
      continue;
    }
    const now = new Date().toISOString();
    // A seeded recovery status belongs to the provider that hit it -- a usage
    // limit or an expired login is per provider, not per room -- so only a
    // request on the default provider fails. That leaves the popover's
    // alternate-provider recovery genuinely exercisable: retrying on the other
    // provider settles normally with the cookie still in place.
    const seededFailure =
      recoveryStatus && request.provider === FAKE_DEFAULT_ASSIST_PROVIDER
        ? recoveryStatus
        : null;
    if (pending.ticks === 0) {
      status.status = "running";
      status.updatedAt = now;
      request.taskStatus = "running";
      request.updatedAt = now;
    } else if (seededFailure) {
      status.status = seededFailure;
      status.updatedAt = now;
      request.status = "failed";
      request.taskStatus = seededFailure;
      request.errorCode = FAKE_ASSIST_ERROR_CODES[seededFailure];
      request.settledAt = now;
      request.updatedAt = now;
      pending.done = true;
    } else {
      status.status = "completed";
      status.updatedAt = now;
      settleFakeAssistRequest(request, now);
      pending.done = true;
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
        const room = store.rooms.find(
          (candidate) => candidate.id === pending.roomId,
        );
        if (room) {
          store.prds.push(buildFakePrd(pending.roomId, room.ownerId));
        }
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
      ) ||
      store.pendingPrdSectionRevisions.some(
        (pending) =>
          pending.taskId === status.taskId && pending.roomId === roomId,
      ) ||
      store.pendingPrdAssists.some(
        (pending) =>
          pending.taskId === status.taskId && pending.roomId === roomId,
      )
  );
}

// The fake's materializer. An edit half only ever lands for a requester whose
// frozen can_propose_edit is true; for a view-only one it degrades to the
// answer half, because that requester's response schema has no proposal slot
// at all rather than a refused one.
function settleFakeAssistRequest(request: PrdAssistRequest, now: string) {
  const store = getStore();
  const fixture = FAKE_ASSIST_FIXTURES.get(request.instruction) ?? "answer";
  const wantsEdit =
    request.canProposeEdit &&
    (fixture === "edit" || fixture === "answer_and_edit");

  if (wantsEdit) {
    // Which of the frozen sections the edit lands on stands in for the model
    // naming a target field: an instruction that names one of the selected
    // section labels targets that section, and one that names none targets the
    // only section a single-section scope has. This is fixture reasoning, not
    // routing -- production reads `targetField` off the provider's response and
    // checks it against the frozen scope.
    const target =
      request.selectedSections.find((section) =>
        request.instruction
          .toLowerCase()
          .includes(section.label.toLowerCase()),
      ) ?? request.selectedSections[0];
    const prd = store.prds.find((candidate) => candidate.id === request.basePrdId);
    const previousValue = prd?.document[target.field as keyof PRDDocument] ?? null;
    const proposal: PrdProposal = {
      id: randomUUID(),
      roomId: request.roomId,
      taskId: request.taskId,
      provider: request.provider,
      basePrdId: request.basePrdId,
      baseVersion: request.baseVersion,
      sectionField: target.field,
      sectionLabel: target.label,
      instruction: request.instruction,
      quotedText: target.quotedText,
      previousValue,
      proposedValue: fakeSectionRevisionValue(
        target.field,
        previousValue,
        request.instruction,
      ),
      status: "ready",
      errorMessage: null,
      createdBy: request.createdBy,
      createdAt: now,
      updatedAt: now,
      appliedAt: null,
      discardedAt: null,
    };
    store.proposals.push(proposal);
    request.proposalId = proposal.id;
  }

  if (fixture === "clarification") {
    request.clarifyingQuestion =
      request.selectedSections.length > 1
        ? FAKE_ASSIST_MULTI_SECTION_CLARIFICATION
        : FAKE_ASSIST_CLARIFICATION;
  } else if (fixture !== "edit" || !wantsEdit) {
    request.answer = FAKE_ASSIST_ANSWER;
  }

  postFakeAssistExchange(request, now);

  request.status = "ready";
  request.taskStatus = "completed";
  request.settledAt = now;
  request.updatedAt = now;
}

// The Conversation half of the materializer. An answer or a clarifying
// question is the durable, shared record of the exchange, so both are persisted
// with the same frozen PRD context the question was asked against. An
// edit-only or failed outcome writes nothing -- it never left the PRD tab.
function postFakeAssistExchange(request: PrdAssistRequest, now: string) {
  const body = request.answer ?? request.clarifyingQuestion;
  if (!body) return;

  const context = (): RoomPrdContext => ({
    prdId: request.basePrdId,
    version: request.baseVersion,
    sections: request.selectedSections.map((section) => ({ ...section })),
    assistRequestId: request.id,
    proposalId: null,
  });

  const question: RoomMessage = {
    id: randomUUID(),
    roomId: request.roomId,
    // The RPC keys the question on the request and the reply on the task, so a
    // replayed settlement cannot post either of them twice.
    clientId: request.id,
    authorType: "human",
    authorId: request.createdBy,
    initiatedBy: null,
    aiTaskId: null,
    provider: null,
    body: request.instruction,
    citedMessageIds: [],
    citedEvidenceIds: [],
    assumptions: [],
    suggestedNextQuestions: [],
    proposedAction: null,
    kind: "prd_context",
    prdContext: context(),
    prdChange: null,
    attachments: [],
    createdAt: now,
    delivery: "persisted",
  };
  const answer: RoomMessage = {
    ...question,
    id: randomUUID(),
    clientId: request.taskId,
    authorType: "product_agent",
    authorId: null,
    initiatedBy: request.createdBy,
    aiTaskId: request.taskId,
    provider: request.provider,
    body,
    citedMessageIds: request.citedMessageIds,
    citedEvidenceIds: request.citedEvidenceIds,
    assumptions: request.assumptions,
    suggestedNextQuestions: request.suggestedNextQuestions,
    prdContext: context(),
    // The materializer uses clock_timestamp() so the question always sorts
    // before the reply under the room's (created_at, id) ordering; one
    // millisecond does the same here.
    createdAt: new Date(new Date(now).getTime() + 1).toISOString(),
  };

  const store = getStore();
  store.messages.push(question, answer);
  request.questionMessageId = question.id;
  request.answerMessageId = answer.id;
}

export async function fakeStageAttachment(input: {
  roomId: string;
  originalName: string;
  mimeType: string;
  caption: string | null;
  extractionStatus: string;
  bytes: Uint8Array;
}): Promise<RoomAttachmentView> {
  const { context } = await requireParticipant(input.roomId);
  const attachment: FakeRoomAttachment = {
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
        // Mirror link_staged_room_attachments: keep the staged caption
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
