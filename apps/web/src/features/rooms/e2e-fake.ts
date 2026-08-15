import "server-only";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import type { AITaskStatus } from "@meld/contracts";
import type { RoomProposedAction } from "@meld/contracts";
import type { DesignScreenEvent } from "@meld/contracts";
import type { DesignReference, DesignReferenceView } from "@meld/contracts";
import type { DesignHandoffManifest, DesignHandoffView } from "@meld/contracts";
import type {
  DesignScreenPayload,
  PrototypeScreen,
} from "@meld/prototype";
import type { CanvasScreen } from "@/features/design/canvas-screen-reader";
import { extractFigmaReferences } from "@/features/design/figma-url";
import {
  E2E_OWNER_ID,
  E2E_PARTICIPATING_ADMIN_ID,
  E2E_PROJECT_ID,
  E2E_SECOND_PROJECT_ID,
  E2E_TEAMMATE_ID,
  E2E_VIEWER_ID,
  E2E_WORKSPACE_ID,
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
import type { ProposalResponse } from "./proposals";
import type { RoomAttachmentView } from "./attachment-types";
import { isRoomFakeEnabled } from "./e2e-gate";
import {
  buildRoomOverview,
  sortRoomDecisions,
  type RoomDecision,
  type RoomOverviewData,
} from "./overview";

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
  // Set only by an accepted decision_capture proposal. It is the unique key
  // that makes a second confirmation return the first one's Decision instead
  // of writing a near-duplicate.
  proposalMessageId?: string | null;
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

type FakePrototypeScreen = {
  id: string;
  roomId: string;
  name: string;
  // "empty" until a generation completes -- the chat-to-screen composer must
  // be able to create and list a screen before it has anything built, the
  // same way the real `design_screens` row starts.
  state: "empty" | "built";
  deletedAt: string | null;
  currentVersionId: string | null;
  canvasX: number;
  canvasY: number;
  flowNodeId: string | null;
};

type FakePrototypeScreenVersion = DesignScreenPayload & {
  id: string;
  screenId: string;
  createdAt: string;
  promoted: boolean;
  // Links a version back to the generation task that produced it, mirroring
  // `design_screen_versions.originating_task_id` -- how
  // `get_design_screen_generation` finds the version a task materialized. A
  // restored version (cloned from a prior one) carries no originating task.
  originatingTaskId: string | null;
};

// The screen generation task the fake advances across status polls, standing
// in for the connector executing create_design_screen_generate_task: queued
// -> running -> completed, and on completion it appends one promoted version
// and flips the screen to "built" -- the same materialization
// materialize_design_screen_generate performs in Postgres.
type FakePendingDesignScreenGeneration = {
  taskId: string;
  roomId: string;
  screenId: string;
  provider: Provider;
  instruction: string;
  initiatedBy: string;
  ticks: number;
  done: boolean;
};

// The design-system-distillation task the fake advances across status polls,
// standing in for the connector executing create_design_profile_distill_task:
// queued -> running -> completed, and on completion it appends one profile
// version and activates it -- the same materialization a real distillation
// settle would perform.
type FakePendingDesignProfileDistillation = {
  taskId: string;
  roomId: string;
  workspaceId: string;
  initiatedBy: string;
  ticks: number;
  done: boolean;
};

type FakeDesignSystemProfile = {
  workspaceId: string;
  activeVersionId: string | null;
};

type FakeDesignSystemProfileVersion = {
  id: string;
  workspaceId: string;
  tokenCss: string;
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

// One participant's answer to one Product Agent proposal, keyed the way
// message_proposal_responses is: per message and per user, so a dismissal is
// only ever the dismisser's.
type FakeProposalResponse = {
  messageId: string;
  userId: string;
  response: ProposalResponse;
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
  prototypeScreens: FakePrototypeScreen[];
  prototypeScreenVersions: FakePrototypeScreenVersion[];
  pendingDesignScreenGenerations: FakePendingDesignScreenGeneration[];
  pendingDesignProfileDistillations: FakePendingDesignProfileDistillation[];
  designSystemProfiles: FakeDesignSystemProfile[];
  designSystemProfileVersions: FakeDesignSystemProfileVersion[];
  proposalResponses: FakeProposalResponse[];
  // The unified history feed's append-only log, mirroring
  // design_screen_events -- fakeGenerateDesignScreen appends
  // "generation_started" when it queues, and the poll advancement in
  // fakeListRoomTaskStatuses appends "version_created" when a version lands.
  designEvents: DesignScreenEvent[];
  // The Figma lane's reference list, mirroring design_references --
  // fakeListRoomDesignReferences reads it and mints a stable fake
  // thumbnailUrl for every "ok" row, the way the real reader signs
  // thumbnail_ref from storage.
  designReferences: DesignReference[];
  // Immutable Design -> Development handoff snapshots, mirroring
  // design_handoff_snapshots -- one row per real stage transition; a fake
  // stage move to development pushes one, and fakeGetRoomDesignHandoff
  // reads the latest by createdAt, exactly as the real reader's
  // .order("created_at",{ascending:false}).limit(1) does.
  designHandoffs: FakeDesignHandoffSnapshot[];
};

type FakeDesignHandoffSnapshot = DesignHandoffView & { roomId: string };

export const E2E_DISCOVERY_ROOM_ID =
  "40000000-0000-4000-8000-000000000001";
// A Room with no durable artifact at all: the only fixture that can show a
// Conversation-only Room renders no tab strip, and the only one whose
// structure can then be grown from the browser.
const E2E_EMPTY_ROOM_ID =
  "40000000-0000-4000-8000-000000000002";
// A Room whose PRD arrived before any user flow. Its whole job is to show that
// the two artifacts are independent: the PRD surface exists without one.
const E2E_PRD_ROOM_ID =
  "40000000-0000-4000-8000-000000000003";
// A Room seeded with one unanswered proposal of each kind the Product Agent
// can raise, so confirming and dismissing are exercised against real controls.
const E2E_PROPOSAL_ROOM_ID =
  "40000000-0000-4000-8000-000000000004";
// A Room already in the Design stage with zero screens built. Its whole job is
// to prove the Prototype surface -- and the chat-to-screen composer on it --
// is reachable before any screen exists, not just after one is built.
export const E2E_DESIGN_ROOM_ID =
  "40000000-0000-4000-8000-000000000005";
// A Room in the Design stage with the User Flows canvas already started and
// exactly one screen frame projected onto it (unbuilt). The fixture slice 3b
// Task 6's e2e drives: draw sketch shapes inside that frame's bounds, select
// the frame, and Generate -- proving the serialized layout reaches the fake
// generation and lands in the built screen's rendered preview.
export const E2E_DESIGN_SKETCH_ROOM_ID =
  "40000000-0000-4000-8000-000000000006";
export const E2E_DESIGN_SKETCH_SCREEN_ID =
  "71000000-0000-4000-8000-000000000003";
// A Room in the Design stage with the User Flows canvas already started and a
// PRD whose journey flow carries exactly one action node ("Pick plan"). Slice
// 3c Task 10's e2e drives: open the Canvas and prove the action node seeds a
// screen frame (planScreenSeeds + seedDesignScreensFromFlow), then generate a
// screen through the composer and prove the History drawer surfaces the
// resulting design events and filters them to a selected screen frame.
export const E2E_DESIGN_HISTORY_ROOM_ID =
  "40000000-0000-4000-8000-000000000007";
// A Room in the Design stage with zero screens built -- dedicated to slice 4b
// Task 6's e2e "ready, then handed off" path: build a screen through the
// Prototype composer, mark Design reviewed, move to Development, and assert
// the panel's handoff summary reads from the snapshot fakeSetRoomStage just
// pushed. Not shared with the other Design-stage e2e fixtures (design-chat-
// to-screen.spec.ts, design-figma-lane.spec.ts) because this one's whole
// point is a real stage transition, which would otherwise strand a screen
// generated by an earlier spec, or move a room a later spec still expects to
// find in Design.
export const E2E_DESIGN_HANDOFF_ROOM_ID =
  "40000000-0000-4000-8000-000000000008";
// A second, separate Design-stage Room with zero screens built -- dedicated to
// the staleness re-gate half of the same e2e: build a screen, mark reviewed,
// then regenerate that screen so its latest revision lands after the review
// timestamp. Kept apart from E2E_DESIGN_HANDOFF_ROOM_ID so the two scenarios
// (one ends in Development, one deliberately stays re-gated in Design) never
// share mutable state.
export const E2E_DESIGN_STALENESS_ROOM_ID =
  "40000000-0000-4000-8000-000000000009";

const E2E_PROPOSAL_QUESTION_MESSAGE_ID =
  "60000000-0000-4000-8000-000000000001";
const E2E_DECISION_PROPOSAL_MESSAGE_ID =
  "60000000-0000-4000-8000-000000000002";
const E2E_USER_FLOW_PROPOSAL_MESSAGE_ID =
  "60000000-0000-4000-8000-000000000003";
const E2E_PRD_PROPOSAL_MESSAGE_ID =
  "60000000-0000-4000-8000-000000000004";
// A conversation message in the history room, seeded so the History drawer's
// deselected state ("show everything") has a non-design-event entry that
// selecting a screen frame filters away.
const E2E_DESIGN_HISTORY_MESSAGE_ID =
  "60000000-0000-4000-8000-000000000005";
const E2E_DESIGN_HISTORY_MESSAGE_BODY =
  "Let's map the plan-picking flow before we design it.";
const E2E_PROPOSED_DECISION_SUMMARY =
  "Ship the mobile checkout summary before adding payment methods.";

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
      userJourneys: {
        title: "Checkout journey",
        summary:
          "A shopper reviews costs, confirms delivery, and completes payment.",
        nodes: [
          { id: "start", kind: "start", label: "Open cart", detail: null },
          { id: "review", kind: "action", label: "Review costs", detail: null },
          {
            id: "delivery",
            kind: "action",
            label: "Confirm delivery",
            detail: null,
          },
          { id: "pay", kind: "action", label: "Complete payment", detail: null },
          { id: "done", kind: "end", label: "Order placed", detail: null },
        ],
        edges: [
          { id: "e1", from: "start", to: "review", label: null },
          { id: "e2", from: "review", to: "delivery", label: null },
          { id: "e3", from: "delivery", to: "pay", label: null },
          { id: "e4", from: "pay", to: "done", label: null },
        ],
        openQuestions: [],
      },
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

// The flow-seeding history room's PRD: same document shape as buildFakePrd,
// but with a journey flow trimmed to exactly one action node ("Pick plan") --
// the minimal shape planScreenSeeds needs to emit exactly one screen seed.
function buildFakeFlowSeedPrd(roomId: string, ownerId: string): RoomPrd {
  const base = buildFakePrd(roomId, ownerId);
  return {
    ...base,
    document: {
      ...base.document,
      userJourneys: {
        title: "Subscription flow",
        summary: "A visitor picks a plan and completes checkout.",
        nodes: [
          { id: "start", kind: "start", label: "Open pricing", detail: null },
          { id: "pick_plan", kind: "action", label: "Pick plan", detail: null },
          { id: "done", kind: "end", label: "Plan selected", detail: null },
        ],
        edges: [
          { id: "e1", from: "start", to: "pick_plan", label: null },
          { id: "e2", from: "pick_plan", to: "done", label: null },
        ],
        openQuestions: [],
      },
    },
  };
}

function buildFakeRoom(input: {
  id: string;
  projectId: string;
  name: string;
  stage?: Room["stage"];
}): Room {
  return {
    id: input.id,
    workspaceId: E2E_WORKSPACE_ID,
    projectId: input.projectId,
    name: input.name,
    ownerId: E2E_OWNER_ID,
    stage: input.stage ?? "discovery",
    createdAt: E2E_CREATED_AT,
    lastActivityAt: E2E_CREATED_AT,
    updatedAt: E2E_CREATED_AT,
  };
}

function buildFakePrototypeSeed(): {
  screens: FakePrototypeScreen[];
  versions: FakePrototypeScreenVersion[];
} {
  const startScreenId = "71000000-0000-4000-8000-000000000001";
  const reviewScreenId = "71000000-0000-4000-8000-000000000002";
  const startVersionId = "72000000-0000-4000-8000-000000000001";
  const reviewVersionId = "72000000-0000-4000-8000-000000000002";

  return {
    screens: [
      {
        id: startScreenId,
        roomId: E2E_DISCOVERY_ROOM_ID,
        name: "Checkout prototype start",
        state: "built",
        deletedAt: null,
        currentVersionId: startVersionId,
        canvasX: 0,
        canvasY: 0,
        flowNodeId: "start",
      },
      {
        id: reviewScreenId,
        roomId: E2E_DISCOVERY_ROOM_ID,
        name: "Order review",
        state: "built",
        deletedAt: null,
        currentVersionId: reviewVersionId,
        canvasX: 1,
        canvasY: 0,
        flowNodeId: "review",
      },
    ],
    versions: [
      {
        id: startVersionId,
        screenId: startScreenId,
        markup:
          '<main><h1>Checkout prototype start</h1><button data-meld-action="review-order">Review order</button></main>',
        styles:
          "main { color: var(--ds-color-primary); } button { color: inherit; }",
        script: null,
        actions: [
          {
            id: "review-order",
            label: "Review order",
            targetScreenId: reviewScreenId,
          },
        ],
        createdAt: E2E_CREATED_AT,
        promoted: true,
        originatingTaskId: null,
      },
      {
        id: reviewVersionId,
        screenId: reviewScreenId,
        markup: "<main><h1>Order review ready</h1></main>",
        styles: "main { color: var(--ds-color-primary); }",
        script: null,
        actions: [],
        createdAt: E2E_CREATED_AT,
        promoted: true,
        originatingTaskId: null,
      },
    ],
  };
}

// One seeded Conversation entry. Everything a proposal needs to render lives
// on the message row in production too, so the fixture carries the same
// contract-typed proposedAction the connector emits rather than a shape only
// the fake understands.
function buildFakeProposalMessage(input: {
  id: string;
  roomId: string;
  body: string;
  proposedAction: RoomProposedAction;
  createdAt: string;
}): RoomMessage {
  return {
    id: input.id,
    roomId: input.roomId,
    clientId: input.id,
    authorType: "product_agent",
    authorId: null,
    initiatedBy: E2E_OWNER_ID,
    aiTaskId: null,
    provider: "codex",
    body: input.body,
    citedMessageIds: [],
    citedEvidenceIds: [],
    assumptions: [],
    suggestedNextQuestions: [],
    proposedAction: input.proposedAction,
    kind: "conversation",
    prdContext: null,
    prdChange: null,
    attachments: [],
    createdAt: input.createdAt,
    delivery: "persisted",
  };
}

function createFakeRoomStore(): FakeRoomStore {
  const prototypeSeed = buildFakePrototypeSeed();
  return {
    rooms: [
      buildFakeRoom({
        id: E2E_DISCOVERY_ROOM_ID,
        projectId: E2E_PROJECT_ID,
        name: "Checkout research",
      }),
      buildFakeRoom({
        id: E2E_EMPTY_ROOM_ID,
        projectId: E2E_PROJECT_ID,
        name: "Onboarding research",
      }),
      buildFakeRoom({
        id: E2E_PRD_ROOM_ID,
        projectId: E2E_SECOND_PROJECT_ID,
        name: "Pricing rework",
      }),
      buildFakeRoom({
        id: E2E_PROPOSAL_ROOM_ID,
        projectId: E2E_PROJECT_ID,
        name: "Support triage",
      }),
      buildFakeRoom({
        id: E2E_DESIGN_ROOM_ID,
        projectId: E2E_PROJECT_ID,
        name: "Fresh design room",
        stage: "design",
      }),
      buildFakeRoom({
        id: E2E_DESIGN_SKETCH_ROOM_ID,
        projectId: E2E_PROJECT_ID,
        // Deliberately avoids the word "canvas" -- the sidebar's accessible
        // name for this room's link concatenates its stage badge ("Design")
        // with this name, and design-canvas.spec.ts / user-flow-trial.spec.ts
        // query the room surface tab by the *unscoped*, substring-matching
        // `getByRole("link", { name: "Canvas" })`, which "…canvas room" would
        // collide with.
        name: "Sketch layout room",
        stage: "design",
      }),
      buildFakeRoom({
        id: E2E_DESIGN_HISTORY_ROOM_ID,
        projectId: E2E_PROJECT_ID,
        // Also avoids the word "canvas" for the same reason as the sketch
        // room's name above.
        name: "Flow seeding room",
        stage: "design",
      }),
      buildFakeRoom({
        id: E2E_DESIGN_HANDOFF_ROOM_ID,
        projectId: E2E_PROJECT_ID,
        name: "Handoff ready room",
        stage: "design",
      }),
      buildFakeRoom({
        id: E2E_DESIGN_STALENESS_ROOM_ID,
        projectId: E2E_PROJECT_ID,
        name: "Staleness re-gate room",
        stage: "design",
      }),
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
      // The empty Room carries the three people stage authorization turns on:
      // its owner, a workspace admin who participates, and an editor who does
      // not administer anything. The nonparticipating admin is deliberately
      // absent -- that absence is the assertion.
      {
        roomId: E2E_EMPTY_ROOM_ID,
        userId: E2E_OWNER_ID,
        access: "edit",
      },
      {
        roomId: E2E_EMPTY_ROOM_ID,
        userId: E2E_PARTICIPATING_ADMIN_ID,
        access: "edit",
      },
      {
        roomId: E2E_EMPTY_ROOM_ID,
        userId: E2E_TEAMMATE_ID,
        access: "edit",
      },
      {
        roomId: E2E_PRD_ROOM_ID,
        userId: E2E_OWNER_ID,
        access: "edit",
      },
      // Two participants in the proposal Room, because a per-user dismissal is
      // only observable against someone else's still-offered proposal.
      {
        roomId: E2E_PROPOSAL_ROOM_ID,
        userId: E2E_OWNER_ID,
        access: "edit",
      },
      {
        roomId: E2E_PROPOSAL_ROOM_ID,
        userId: E2E_TEAMMATE_ID,
        access: "edit",
      },
      {
        roomId: E2E_DESIGN_ROOM_ID,
        userId: E2E_OWNER_ID,
        access: "edit",
      },
      {
        roomId: E2E_DESIGN_SKETCH_ROOM_ID,
        userId: E2E_OWNER_ID,
        access: "edit",
      },
      {
        roomId: E2E_DESIGN_HISTORY_ROOM_ID,
        userId: E2E_OWNER_ID,
        access: "edit",
      },
      {
        roomId: E2E_DESIGN_HANDOFF_ROOM_ID,
        userId: E2E_OWNER_ID,
        access: "edit",
      },
      {
        roomId: E2E_DESIGN_STALENESS_ROOM_ID,
        userId: E2E_OWNER_ID,
        access: "edit",
      },
    ],
    messages: [
      {
        id: E2E_DESIGN_HISTORY_MESSAGE_ID,
        roomId: E2E_DESIGN_HISTORY_ROOM_ID,
        clientId: E2E_DESIGN_HISTORY_MESSAGE_ID,
        authorType: "human",
        authorId: E2E_OWNER_ID,
        initiatedBy: null,
        aiTaskId: null,
        provider: null,
        body: E2E_DESIGN_HISTORY_MESSAGE_BODY,
        citedMessageIds: [],
        citedEvidenceIds: [],
        assumptions: [],
        suggestedNextQuestions: [],
        proposedAction: null,
        kind: "conversation",
        prdContext: null,
        prdChange: null,
        attachments: [],
        createdAt: "2026-08-02T10:36:00.000Z",
        delivery: "persisted",
      },
      {
        id: E2E_PROPOSAL_QUESTION_MESSAGE_ID,
        roomId: E2E_PROPOSAL_ROOM_ID,
        clientId: E2E_PROPOSAL_QUESTION_MESSAGE_ID,
        authorType: "human",
        authorId: E2E_OWNER_ID,
        initiatedBy: null,
        aiTaskId: null,
        provider: null,
        body: "Support keeps hearing that the total appears too late.",
        citedMessageIds: [],
        citedEvidenceIds: [],
        assumptions: [],
        suggestedNextQuestions: [],
        proposedAction: null,
        kind: "conversation",
        prdContext: null,
        prdChange: null,
        attachments: [],
        createdAt: "2026-08-02T10:36:00.000Z",
        delivery: "persisted",
      },
      buildFakeProposalMessage({
        id: E2E_DECISION_PROPOSAL_MESSAGE_ID,
        roomId: E2E_PROPOSAL_ROOM_ID,
        body: "That sounds like a decision the room has already made.",
        proposedAction: {
          kind: "decision_capture",
          summary: E2E_PROPOSED_DECISION_SUMMARY,
          sourceMessageId: E2E_PROPOSAL_QUESTION_MESSAGE_ID,
        },
        createdAt: "2026-08-02T10:37:00.000Z",
      }),
      buildFakeProposalMessage({
        id: E2E_USER_FLOW_PROPOSAL_MESSAGE_ID,
        roomId: E2E_PROPOSAL_ROOM_ID,
        body: "Mapping the checkout path would show where the total lands.",
        proposedAction: { kind: "user_flow_generate" },
        createdAt: "2026-08-02T10:38:00.000Z",
      }),
      buildFakeProposalMessage({
        id: E2E_PRD_PROPOSAL_MESSAGE_ID,
        roomId: E2E_PROPOSAL_ROOM_ID,
        body: "I can turn this room's conversation into a full PRD.",
        proposedAction: { kind: "prd_generate" },
        createdAt: "2026-08-02T10:39:00.000Z",
      }),
    ],
    evidence: [],
    decisions: [],
    attachments: [],
    taskStatuses: [],
    pendingReplies: [],
    // The pre-existing E2E room ships with a PRD so the view regression has a
    // document to open; freshly created rooms start with none until generation.
    // The PRD room ships with one too, and with no user flow, so the two
    // artifacts can be shown to arrive independently of each other.
    prds: [
      buildFakePrd(E2E_DISCOVERY_ROOM_ID, E2E_OWNER_ID),
      buildFakePrd(E2E_PRD_ROOM_ID, E2E_OWNER_ID),
      buildFakeFlowSeedPrd(E2E_DESIGN_HISTORY_ROOM_ID, E2E_OWNER_ID),
    ],
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
      // Started so the sketch-generate room's "user-flows" surface (the
      // Canvas tab) is reachable -- getRoomSurfaces gates it on hasUserFlow.
      {
        roomId: E2E_DESIGN_SKETCH_ROOM_ID,
        createdBy: E2E_OWNER_ID,
        createdAt: E2E_CREATED_AT,
      },
      // Same, for the flow-seeding history room -- and its PRD's journey flow
      // is what the Canvas's auto-seed effect reads to plant the "Pick plan"
      // screen the first time an editor opens an otherwise-empty canvas.
      {
        roomId: E2E_DESIGN_HISTORY_ROOM_ID,
        createdBy: E2E_OWNER_ID,
        createdAt: E2E_CREATED_AT,
      },
    ],
    prototypeScreens: [
      ...prototypeSeed.screens,
      // The sketch-generate room's single, unbuilt screen -- its canvas
      // frame is what reconcileScreenFrames projects onto the tldraw canvas,
      // giving the e2e something to draw sketch shapes inside of.
      {
        id: E2E_DESIGN_SKETCH_SCREEN_ID,
        roomId: E2E_DESIGN_SKETCH_ROOM_ID,
        name: "Sketch layout screen",
        state: "empty",
        deletedAt: null,
        currentVersionId: null,
        canvasX: 0,
        canvasY: 0,
        flowNodeId: null,
      },
    ],
    prototypeScreenVersions: prototypeSeed.versions,
    pendingDesignScreenGenerations: [],
    pendingDesignProfileDistillations: [],
    designSystemProfiles: [],
    designSystemProfileVersions: [],
    proposalResponses: [],
    designEvents: [],
    designReferences: [],
    designHandoffs: [],
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
  if (!globalState[FAKE_DISCOVERY_STORE_KEY].prototypeScreens) {
    const prototypeSeed = buildFakePrototypeSeed();
    globalState[FAKE_DISCOVERY_STORE_KEY].prototypeScreens =
      prototypeSeed.screens;
    globalState[FAKE_DISCOVERY_STORE_KEY].prototypeScreenVersions =
      prototypeSeed.versions;
  }
  globalState[FAKE_DISCOVERY_STORE_KEY].prototypeScreenVersions ??= [];
  globalState[FAKE_DISCOVERY_STORE_KEY].pendingDesignScreenGenerations ??= [];
  globalState[FAKE_DISCOVERY_STORE_KEY].pendingDesignProfileDistillations ??=
    [];
  globalState[FAKE_DISCOVERY_STORE_KEY].designSystemProfiles ??= [];
  globalState[FAKE_DISCOVERY_STORE_KEY].designSystemProfileVersions ??= [];
  globalState[FAKE_DISCOVERY_STORE_KEY].proposalResponses ??= [];
  globalState[FAKE_DISCOVERY_STORE_KEY].designEvents ??= [];
  globalState[FAKE_DISCOVERY_STORE_KEY].designReferences ??= [];
  globalState[FAKE_DISCOVERY_STORE_KEY].designHandoffs ??= [];
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

// Mirrors create_design_handoff_snapshot_unchecked
// (202608140006_design_handoff.sql): assembles the immutable manifest of
// every built, non-deleted screen (ordered by canvas_x, same as
// builtFakePrototypeScreens/fakeRoomBuiltDesignScreenCount already sort),
// the earliest of those as the start screen, the highest recorded PRD
// version for the room (null when there is none, mirroring `max(...)` over
// an empty set), and the workspace's active design-system-profile version --
// always null here, since no fake design-system-profile store exists yet
// (fake-backend.ts's getRoomPageData hardcodes hasDesignProfile: false for
// the same reason). Called only from fakeSetRoomStage's Design ->
// Development branch, mirroring set_room_stage's own `perform` of the real
// RPC inside the same transaction.
function pushFakeDesignHandoffSnapshot(roomId: string): void {
  const store = getStore();
  const builtScreens = store.prototypeScreens
    .filter(
      (screen) =>
        screen.roomId === roomId &&
        screen.state === "built" &&
        screen.deletedAt === null &&
        screen.currentVersionId !== null,
    )
    .toSorted(
      (left, right) =>
        left.canvasX - right.canvasX || left.id.localeCompare(right.id),
    );
  const manifest: DesignHandoffManifest = {
    screens: builtScreens.map((screen) => ({
      screenId: screen.id,
      name: screen.name,
      currentVersionId: screen.currentVersionId,
    })),
  };
  const prdRevision = store.prds
    .filter((prd) => prd.roomId === roomId)
    .reduce<number | null>(
      (max, prd) => (max === null || prd.version > max ? prd.version : max),
      null,
    );
  const snapshot: FakeDesignHandoffSnapshot = {
    id: randomUUID(),
    roomId,
    manifest,
    startScreenId: builtScreens[0]?.id ?? null,
    profileVersionId: null,
    prdRevision,
    createdAt: new Date().toISOString(),
  };
  store.designHandoffs.push(snapshot);
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
  const previousStage = room.stage;
  room.stage = input.stage;
  room.updatedAt = new Date().toISOString();
  // Real behavior: set_room_stage atomically writes a handoff snapshot only
  // on a genuine Design -> Development move (202608140006_design_handoff.sql).
  if (previousStage === "design" && input.stage === "development") {
    pushFakeDesignHandoffSnapshot(input.roomId);
  }
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

function builtFakePrototypeScreens(roomId: string): PrototypeScreen[] {
  const store = getStore();
  return store.prototypeScreens
    .filter(
      (screen) =>
        screen.roomId === roomId &&
        screen.state === "built" &&
        screen.deletedAt === null &&
        screen.currentVersionId !== null,
    )
    .toSorted(
      (left, right) =>
        left.canvasX - right.canvasX || left.id.localeCompare(right.id),
    )
    .flatMap((screen) => {
      const version = store.prototypeScreenVersions.find(
        (candidate) =>
          candidate.id === screen.currentVersionId &&
          candidate.screenId === screen.id,
      );
      return version
        ? [
            {
              id: screen.id,
              name: screen.name,
              markup: version.markup,
              styles: version.styles,
              script: version.script,
              actions: version.actions.map((action) => ({ ...action })),
            },
          ]
        : [];
    });
}

// A participant-authorized projection of the fake's table-shaped screen and
// current-version records. Production gets the same shape through two RLS
// reads before both paths enter the validated assembler.
export async function fakeListRoomPrototypeScreens(input: {
  workspaceId: string;
  roomId: string;
}): Promise<PrototypeScreen[]> {
  const { room } = await requireParticipant(input.roomId);
  if (room.workspaceId !== input.workspaceId) return [];
  return builtFakePrototypeScreens(input.roomId);
}

export async function fakeListRoomCanvasScreens(
  roomId: string,
): Promise<CanvasScreen[]> {
  await requireParticipant(roomId);
  const store = getStore();
  return store.prototypeScreens
    .filter(
      (screen) => screen.roomId === roomId && screen.deletedAt === null,
    )
    .toSorted(
      (left, right) =>
        left.canvasX - right.canvasX || left.id.localeCompare(right.id),
    )
    .map((screen) => {
      const version = screen.currentVersionId
        ? store.prototypeScreenVersions.find(
            (candidate) =>
              candidate.id === screen.currentVersionId &&
              candidate.screenId === screen.id,
          )
        : undefined;
      return {
        id: screen.id,
        name: screen.name,
        canvasX: screen.canvasX,
        canvasY: screen.canvasY,
        flowNodeId: screen.flowNodeId,
        state: screen.state,
        // The fake store doesn't yet track a semantic screen_key (Task 8
        // resolves by key); null mirrors an unkeyed legacy screen.
        screenKey: null,
        formFactor: "desktop",
        preview:
          screen.state === "built" && version
            ? {
                markup: version.markup,
                styles: version.styles,
                script: version.script,
                actions: version.actions.map((action) => ({ ...action })),
              }
            : null,
      };
    });
}

// Called only after fakeGetRoom has authorized the page read, matching the
// other synchronous fake surface signals.
export function fakeRoomHasBuiltDesignScreen(roomId: string): boolean {
  return builtFakePrototypeScreens(roomId).length > 0;
}

// The readiness signal's exact count, mirroring the `design_screens` count
// query the Supabase backend runs -- same built/not-deleted/has-a-version
// filter `builtFakePrototypeScreens` already applies.
export function fakeRoomBuiltDesignScreenCount(roomId: string): number {
  return builtFakePrototypeScreens(roomId).length;
}

export function fakeRoomDesignReferenceCount(roomId: string): number {
  return getStore().designReferences.filter(
    (reference) => reference.roomId === roomId,
  ).length;
}

// Mirrors the Supabase backend's max of `design_screen_versions.created_at`
// and `design_references.created_at` for the room -- null when the room has
// neither.
export function fakeRoomLatestDesignRevisionAt(roomId: string): string | null {
  const store = getStore();
  const screenIds = new Set(
    store.prototypeScreens
      .filter((screen) => screen.roomId === roomId)
      .map((screen) => screen.id),
  );
  const timestamps = [
    ...store.prototypeScreenVersions
      .filter((version) => screenIds.has(version.screenId))
      .map((version) => version.createdAt),
    ...store.designReferences
      .filter((reference) => reference.roomId === roomId)
      .map((reference) => reference.createdAt),
  ];
  return timestamps.length === 0
    ? null
    : timestamps.reduce((latest, current) =>
        current > latest ? current : latest,
      );
}

// The generated screen never runs through the validated safety scan the real
// path does, but a fake instruction can still contain markup-shaped text
// (quotes, angle brackets) typed by whoever is driving the browser. Escaping
// keeps the fixture inside the same "well-formed fragment" contract
// findScreenSafetyViolations enforces for real.
function escapeFakeScreenText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

type FakeRoomDesignScreen = {
  id: string;
  name: string;
  state: "empty" | "built";
  updating: boolean;
  current_version_id: string | null;
};

// The composer's screen list: every screen in the Room, built or not, so it
// can render before the first generation lands. Mirrors listRoomDesignScreens'
// real `design_screens` read (same columns, same canvas_x ordering).
export async function fakeListRoomDesignScreens(
  roomId: string,
): Promise<FakeRoomDesignScreen[]> {
  await requireParticipant(roomId);
  const store = getStore();
  const updatingScreenIds = new Set(
    store.pendingDesignScreenGenerations
      .filter((pending) => pending.roomId === roomId && !pending.done)
      .map((pending) => pending.screenId),
  );
  return store.prototypeScreens
    .filter(
      (screen) => screen.roomId === roomId && screen.deletedAt === null,
    )
    .toSorted(
      (left, right) =>
        left.canvasX - right.canvasX || left.id.localeCompare(right.id),
    )
    .map((screen) => ({
      id: screen.id,
      name: screen.name,
      state: screen.state,
      updating: updatingScreenIds.has(screen.id),
      current_version_id: screen.currentVersionId,
    }));
}

// Mirrors seed_design_screens_from_flow: one empty screen per node whose
// flow_node_id isn't already present among this room's live screens --
// standing in for the (room_id, flow_node_id) unique index + ON CONFLICT DO
// NOTHING the RPC relies on for idempotent, multiplayer-safe seeding. Editor
// authority matches create_design_screen. Screens land in the same
// prototypeScreens store fakeListRoomCanvasScreens reads, so a seeded node
// shows up on the canvas immediately.
export async function fakeSeedDesignScreensFromFlow(
  roomId: string,
  seeds: { nodeId: string; name: string; x: number; y: number }[],
): Promise<CanvasScreen[]> {
  await requireEditor(roomId);
  const store = getStore();
  const seededFlowNodeIds = new Set(
    store.prototypeScreens
      .filter(
        (screen) => screen.roomId === roomId && screen.deletedAt === null,
      )
      .flatMap((screen) => (screen.flowNodeId ? [screen.flowNodeId] : [])),
  );
  const created: CanvasScreen[] = [];
  for (const seed of seeds) {
    if (seededFlowNodeIds.has(seed.nodeId)) continue;
    seededFlowNodeIds.add(seed.nodeId);
    const screen: FakePrototypeScreen = {
      id: randomUUID(),
      roomId,
      name: seed.name,
      state: "empty",
      deletedAt: null,
      currentVersionId: null,
      canvasX: seed.x,
      canvasY: seed.y,
      flowNodeId: seed.nodeId,
    };
    store.prototypeScreens.push(screen);
    created.push({
      id: screen.id,
      name: screen.name,
      canvasX: screen.canvasX,
      canvasY: screen.canvasY,
      flowNodeId: screen.flowNodeId,
      state: screen.state,
      screenKey: null,
      formFactor: "desktop",
      preview: null,
    });
  }
  return created;
}

// Mirrors generateDesignScreen: creates the screen (if the caller did not
// name one) or reuses it, then queues the design_screen_generate task the
// status poll advances. Standing in for create_design_screen +
// create_design_screen_generate_task against the in-memory store.
export async function fakeGenerateDesignScreen(input: {
  roomId: string;
  screenId?: string;
  name?: string;
  instruction: string;
  provider?: Provider;
}): Promise<
  | { status: "queued"; taskId: string; screenId: string }
  | { status: "error"; message: string }
> {
  const GENERATION_ERROR = "We could not start screen generation.";
  try {
    const { context } = await requireEditor(input.roomId);
    const store = getStore();
    let screenId = input.screenId;
    if (screenId) {
      const screen = store.prototypeScreens.find(
        (candidate) =>
          candidate.id === screenId &&
          candidate.roomId === input.roomId &&
          candidate.deletedAt === null,
      );
      if (!screen) return { status: "error", message: GENERATION_ERROR };
    } else {
      const existingCount = store.prototypeScreens.filter(
        (candidate) =>
          candidate.roomId === input.roomId && candidate.deletedAt === null,
      ).length;
      screenId = randomUUID();
      store.prototypeScreens.push({
        id: screenId,
        roomId: input.roomId,
        name: input.name?.trim() || "Screen",
        state: "empty",
        deletedAt: null,
        currentVersionId: null,
        canvasX: existingCount,
        canvasY: 0,
        flowNodeId: null,
      });
    }
    const provider: Provider = input.provider ?? "codex";
    const taskId = randomUUID();
    const now = new Date().toISOString();
    store.taskStatuses.push({
      taskId,
      sourceMessageId: null,
      initiatingUserId: context.user.id,
      provider,
      kind: "design_screen_generate",
      agentKind: "product",
      status: "queued",
      createdAt: now,
      updatedAt: now,
    });
    store.pendingDesignScreenGenerations.push({
      taskId,
      roomId: input.roomId,
      screenId,
      provider,
      instruction: input.instruction,
      initiatedBy: context.user.id,
      ticks: 0,
      done: false,
    });
    // Mirrors create_design_screen_generate_task's append_design_screen_event
    // call: logged the moment the task is queued, actor is the caller who
    // started it.
    store.designEvents.push({
      id: randomUUID(),
      roomId: input.roomId,
      screenId,
      kind: "generation_started",
      messageId: null,
      taskId,
      versionId: null,
      actor: context.user.id,
      createdAt: now,
    });
    return { status: "queued", taskId, screenId };
  } catch {
    return { status: "error", message: GENERATION_ERROR };
  }
}

// Mirrors get_design_screen_generation: the version a task materialized, or
// nulls while it is still in flight -- the signal
// useDesignScreenGeneration's poll acts on.
export async function fakeGetDesignScreenGeneration(taskId: string): Promise<{
  taskId: string;
  screenId: string;
  versionId: string | null;
  promoted: boolean | null;
} | null> {
  const store = getStore();
  const pending = store.pendingDesignScreenGenerations.find(
    (candidate) => candidate.taskId === taskId,
  );
  if (!pending) return null;
  await requireParticipant(pending.roomId);
  const version = store.prototypeScreenVersions.find(
    (candidate) => candidate.originatingTaskId === taskId,
  );
  return {
    taskId,
    screenId: pending.screenId,
    versionId: version?.id ?? null,
    promoted: version?.promoted ?? null,
  };
}

// Mirrors get_active_design_profile: whether the room's workspace has an
// active design-system-profile version -- the signal the profile-upload
// banner uses to decide whether to show itself at all.
export async function fakeGetActiveDesignProfile(
  roomId: string,
): Promise<{ hasActiveProfile: boolean }> {
  const { room } = await requireParticipant(roomId);
  const store = getStore();
  const profile = store.designSystemProfiles.find(
    (candidate) => candidate.workspaceId === room.workspaceId,
  );
  return { hasActiveProfile: profile?.activeVersionId != null };
}

// Mirrors create_design_profile_distill_task: queues one task the poll
// advancement below settles. Standing in for the RPC against the in-memory
// store -- no storage bucket, since the fake never really uploads bytes.
export async function fakeUploadDesignSystemDocument(input: {
  roomId: string;
  fileName: string;
  extractedText: string;
}): Promise<
  { status: "queued"; taskId: string } | { status: "error"; message: string }
> {
  const UPLOAD_ERROR = "We could not start design-system distillation.";
  try {
    const { room, context } = await requireEditor(input.roomId);
    const store = getStore();
    const taskId = randomUUID();
    const now = new Date().toISOString();
    store.taskStatuses.push({
      taskId,
      sourceMessageId: null,
      initiatingUserId: context.user.id,
      provider: "codex",
      kind: "design_profile_distill",
      agentKind: "product",
      status: "queued",
      createdAt: now,
      updatedAt: now,
    });
    store.pendingDesignProfileDistillations.push({
      taskId,
      roomId: input.roomId,
      workspaceId: room.workspaceId,
      initiatedBy: context.user.id,
      ticks: 0,
      done: false,
    });
    return { status: "queued", taskId };
  } catch {
    return { status: "error", message: UPLOAD_ERROR };
  }
}

// Mirrors get_design_profile_distillation: the version a distillation task
// materialized, or nulls while it is still in flight -- the signal
// useDesignProfileDistillation's poll acts on.
export async function fakeGetDesignProfileDistillation(
  taskId: string,
): Promise<{
  taskId: string;
  versionId: string | null;
  isActive: boolean | null;
} | null> {
  const store = getStore();
  const pending = store.pendingDesignProfileDistillations.find(
    (candidate) => candidate.taskId === taskId,
  );
  if (!pending) return null;
  await requireParticipant(pending.roomId);
  const version = store.designSystemProfileVersions.find(
    (candidate) => candidate.workspaceId === pending.workspaceId && pending.done,
  );
  const profile = store.designSystemProfiles.find(
    (candidate) => candidate.workspaceId === pending.workspaceId,
  );
  return {
    taskId,
    versionId: version?.id ?? null,
    isActive: version ? version.id === profile?.activeVersionId : null,
  };
}

// Mirrors listRoomDesignEvents: the unified history feed's read, oldest
// first -- the order the (room_id, created_at) index and its real query
// serve.
export async function fakeListRoomDesignEvents(
  roomId: string,
): Promise<DesignScreenEvent[]> {
  await requireParticipant(roomId);
  const store = getStore();
  return store.designEvents
    .filter((event) => event.roomId === roomId)
    .toSorted((left, right) => left.createdAt.localeCompare(right.createdAt));
}

// Mirrors listRoomDesignReferences: the Figma lane's reference list, oldest
// first. Stands in for the real reader's signed URL with a stable fake
// string per reference id so a browser spec can assert an image renders
// without a live storage bucket.
export async function fakeListRoomDesignReferences(
  roomId: string,
): Promise<DesignReferenceView[]> {
  await requireParticipant(roomId);
  const store = getStore();
  return store.designReferences
    .filter((reference) => reference.roomId === roomId)
    .toSorted((left, right) => left.createdAt.localeCompare(right.createdAt))
    .map((reference) => ({
      ...reference,
      thumbnailUrl:
        reference.oembedStatus === "ok"
          ? `https://example.test/fake-design-reference-thumbnails/${reference.id}.png`
          : null,
    }));
}

// Mirrors getRoomDesignHandoff: the latest immutable Design -> Development
// handoff snapshot for a Room, newest first, same as the real reader's
// .order("created_at",{ascending:false}).limit(1).maybeSingle().
export async function fakeGetRoomDesignHandoff(
  roomId: string,
): Promise<DesignHandoffView | null> {
  await requireParticipant(roomId);
  const store = getStore();
  const latest = store.designHandoffs
    .filter((snapshot) => snapshot.roomId === roomId)
    .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  if (!latest) return null;
  return {
    id: latest.id,
    manifest: latest.manifest,
    startScreenId: latest.startScreenId,
    profileVersionId: latest.profileVersionId,
    prdRevision: latest.prdRevision,
    createdAt: latest.createdAt,
  };
}

// Mirrors recordFigmaReferences' real-backend behavior: extract every Figma
// URL from a posted message body and upsert one row per unique normalized
// URL into store.designReferences (dedupe by normalizedUrl, mirroring
// add_design_reference's insert-or-touch upsert), each starting "pending".
// Best-effort like its real counterpart -- swallows any failure rather than
// throwing, since it is never allowed to fail a message post.
export async function fakeRecordFigmaReferences(
  roomId: string,
  body: string,
): Promise<void> {
  try {
    const urls = extractFigmaReferences(body);
    if (urls.length === 0) return;
    await requireEditor(roomId);
    const store = getStore();
    for (const url of urls) {
      const existing = store.designReferences.find(
        (reference) =>
          reference.roomId === roomId && reference.normalizedUrl === url,
      );
      if (existing) continue;
      store.designReferences.push({
        id: randomUUID(),
        roomId,
        normalizedUrl: url,
        title: null,
        oembedStatus: "pending",
        fetchedAt: null,
        createdAt: new Date().toISOString(),
      });
    }
  } catch (thrown) {
    console.error("fakeRecordFigmaReferences threw", { roomId, thrown });
  }
}

// Mirrors refreshDesignReference: simulates a successful oEmbed fetch + cache
// with no real network call -- flips the stored reference to "ok" with a
// stable fake title + thumbnail, the way the real action would after
// fetchFigmaOEmbed and the storage upload both succeed. Requires editor
// access, same as the real RPC's can_edit_room check.
//
// The one deliberate bit of unreality: a short fixed pause before flipping
// the row. FigmaReferenceCard fires this the instant an editor's card mounts
// "pending", so with no pause at all the round trip settles fast enough that
// a browser never has a chance to paint the pending card before it is
// already "ok" -- true speed the real oEmbed fetch's actual network latency
// would never produce. The pause stands in for that latency so the pending
// state a real fetch would show is observable here too, rather than an
// artifact of the fake having none.
const FAKE_REFRESH_DELAY_MS = 400;

export async function fakeRefreshDesignReference(
  referenceId: string,
): Promise<DesignReferenceView | null> {
  try {
    const store = getStore();
    const reference = store.designReferences.find(
      (candidate) => candidate.id === referenceId,
    );
    if (!reference) return null;
    await requireEditor(reference.roomId);
    await new Promise((resolve) => setTimeout(resolve, FAKE_REFRESH_DELAY_MS));
    reference.title = `Fake Figma file ${reference.id.slice(0, 8)}`;
    reference.oembedStatus = "ok";
    reference.fetchedAt = new Date().toISOString();
    return {
      ...reference,
      thumbnailUrl: `https://example.test/fake-design-reference-thumbnails/${reference.id}.png`,
    };
  } catch (thrown) {
    console.error("fakeRefreshDesignReference threw", { referenceId, thrown });
    return null;
  }
}

// Mirrors removeDesignReference: deletes one row from store.designReferences
// by id, the fake counterpart to the delete_design_reference RPC.
export async function fakeRemoveDesignReference(
  referenceId: string,
): Promise<{ status: "removed" } | { status: "error" }> {
  try {
    const store = getStore();
    const reference = store.designReferences.find(
      (candidate) => candidate.id === referenceId,
    );
    if (!reference) return { status: "error" };
    await requireEditor(reference.roomId);
    store.designReferences = store.designReferences.filter(
      (candidate) => candidate.id !== referenceId,
    );
    return { status: "removed" };
  } catch (thrown) {
    console.error("fakeRemoveDesignReference threw", { referenceId, thrown });
    return { status: "error" };
  }
}

// Mirrors listRoomDesignScreens' sibling read of a screen's version history,
// newest first, the shape the composer's "Prior versions" list reads.
export async function fakeListDesignScreenVersions(
  screenId: string,
): Promise<Array<{ id: string; createdAt: string; promoted: boolean }>> {
  const store = getStore();
  const screen = store.prototypeScreens.find(
    (candidate) => candidate.id === screenId,
  );
  if (!screen) return [];
  await requireParticipant(screen.roomId);
  return store.prototypeScreenVersions
    .filter((version) => version.screenId === screenId)
    .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((version) => ({
      id: version.id,
      createdAt: version.createdAt,
      promoted: version.promoted,
    }));
}

// Mirrors restore_design_screen_version: append-only history, so restoring a
// prior version clones it into a new, promoted, current version rather than
// rewinding the pointer.
export async function fakeRestoreDesignScreenVersion(input: {
  screenId: string;
  versionId: string;
}): Promise<
  | { status: "restored"; versionId: string }
  | { status: "error"; message: string }
> {
  try {
    const store = getStore();
    const screen = store.prototypeScreens.find(
      (candidate) => candidate.id === input.screenId,
    );
    if (!screen) return { status: "error", message: "Could not restore." };
    await requireEditor(screen.roomId);
    const source = store.prototypeScreenVersions.find(
      (candidate) =>
        candidate.id === input.versionId &&
        candidate.screenId === input.screenId,
    );
    if (!source) return { status: "error", message: "Could not restore." };
    const restoredId = randomUUID();
    store.prototypeScreenVersions.push({
      id: restoredId,
      screenId: screen.id,
      markup: source.markup,
      styles: source.styles,
      script: source.script,
      actions: source.actions.map((action) => ({ ...action })),
      createdAt: new Date().toISOString(),
      promoted: true,
      originatingTaskId: null,
    });
    screen.state = "built";
    screen.currentVersionId = restoredId;
    return { status: "restored", versionId: restoredId };
  } catch {
    return { status: "error", message: "Could not restore." };
  }
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
  const deletedMessageIds = new Set(
    store.messages
      .filter((message) => message.roomId === room.id)
      .map((message) => message.id),
  );
  store.proposalResponses = store.proposalResponses.filter(
    (response) => !deletedMessageIds.has(response.messageId),
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
  const deletedPrototypeScreenIds = new Set(
    store.prototypeScreens
      .filter((screen) => screen.roomId === room.id)
      .map((screen) => screen.id),
  );
  store.prototypeScreens = store.prototypeScreens.filter(
    (screen) => screen.roomId !== room.id,
  );
  store.prototypeScreenVersions = store.prototypeScreenVersions.filter(
    (version) => !deletedPrototypeScreenIds.has(version.screenId),
  );
  store.proposals = store.proposals.filter(
    (proposal) => proposal.roomId !== room.id,
  );
  store.assistRequests = store.assistRequests.filter(
    (request) => request.roomId !== room.id,
  );
  store.pendingDesignScreenGenerations =
    store.pendingDesignScreenGenerations.filter(
      (pending) => pending.roomId !== room.id,
    );
  const remainingTaskIds = new Set([
    ...store.pendingReplies.map((pending) => pending.taskId),
    ...store.pendingPrdGenerations.map((pending) => pending.taskId),
    ...store.pendingPrdSectionRevisions.map((pending) => pending.taskId),
    ...store.pendingPrdAssists.map((pending) => pending.taskId),
    ...store.pendingDesignScreenGenerations.map((pending) => pending.taskId),
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

export async function fakeListRoomDecisions(
  roomId: string,
): Promise<RoomDecision[]> {
  const roomData = await fakeGetRoom(roomId);
  const decisionAuthorIds = new Set(
    roomData.decisions.map((decision) => decision.createdBy),
  );
  const memberNameById = new Map(
    roomData.members
      .filter((member) => decisionAuthorIds.has(member.user_id))
      .map((member) => [member.user_id, member.email]),
  );
  return sortRoomDecisions(
    roomData.decisions.map((decision) => ({
      id: decision.id,
      sourceMessageId: decision.sourceMessageId ?? null,
      summary: decision.summary,
      createdAt: decision.createdAt,
      createdByName:
        memberNameById.get(decision.createdBy) ?? "Unknown member",
    })),
  );
}

export async function fakeGetRoomOverview(
  roomId: string,
): Promise<RoomOverviewData> {
  const roomData = await fakeGetRoom(roomId);
  const store = getStore();
  const decisions = await fakeListRoomDecisions(roomId);
  const roomPrds = store.prds.filter((prd) => prd.roomId === roomId);
  const roomUserFlows = store.userFlows.filter(
    (flow) => flow.roomId === roomId,
  );

  return buildRoomOverview({
    stage: roomData.room.stage,
    roomCreatedAt: roomData.room.createdAt,
    roomUpdatedAt: roomData.room.updatedAt,
    activityTimestamps: [
      ...roomData.messages.map((message) => message.createdAt),
      ...decisions.map((decision) => decision.createdAt),
      ...roomUserFlows.map((flow) => flow.createdAt),
      ...roomPrds.flatMap((prd) => [prd.createdAt, prd.updatedAt]),
    ],
    participantCount: roomData.participants.length,
    participants: roomData.participants.map((participant) => ({
      userId: participant.userId,
      email:
        roomData.members.find(
          (member) => member.user_id === participant.userId,
        )?.email ?? "Unknown member",
      access: participant.access,
    })),
    counts: {
      userFlows: roomUserFlows.length,
      prds: roomPrds.length > 0 ? 1 : 0,
      decisions: decisions.length,
    },
    decisions,
  });
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

function projectFakeRoomTaskStatuses(
  roomId: string,
  store: FakeRoomStore,
): RoomTaskStatus[] {
  return store.taskStatuses
    .filter(
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
        ) ||
        store.pendingDesignScreenGenerations.some(
          (pending) =>
            pending.taskId === status.taskId && pending.roomId === roomId,
        ),
    )
    .map((status) => ({ ...status }));
}

export async function fakeGetRoomTaskStatuses(
  roomId: string,
): Promise<RoomTaskStatus[]> {
  await requireParticipant(roomId);
  return projectFakeRoomTaskStatuses(roomId, getStore());
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

  // Advance any queued screen generation the same way: queued -> running ->
  // completed, appending one promoted version and flipping the screen to
  // "built" on completion -- the same materialization
  // materialize_design_screen_generate performs when a real connector settles
  // the task. useDesignScreenGeneration's own poll of
  // getDesignScreenGeneration then sees a non-null versionId and delivers.
  for (const pending of store.pendingDesignScreenGenerations) {
    if (pending.roomId !== roomId || pending.done) {
      continue;
    }
    const status = store.taskStatuses.find(
      (candidate) => candidate.taskId === pending.taskId,
    );
    const screen = store.prototypeScreens.find(
      (candidate) => candidate.id === pending.screenId,
    );
    if (!status || !screen) {
      pending.done = true;
      continue;
    }
    if (pending.ticks < 1) {
      status.status = "running";
      status.updatedAt = new Date().toISOString();
    } else {
      const now = new Date().toISOString();
      status.status = "completed";
      status.updatedAt = now;
      pending.done = true;
      const versionId = randomUUID();
      store.prototypeScreenVersions.push({
        id: versionId,
        screenId: screen.id,
        markup: `<main><h1>${escapeFakeScreenText(screen.name)}</h1><p>${escapeFakeScreenText(pending.instruction)}</p></main>`,
        styles: "main { color: var(--ds-color-primary); }",
        script: null,
        actions: [],
        createdAt: now,
        promoted: true,
        originatingTaskId: pending.taskId,
      });
      screen.state = "built";
      screen.currentVersionId = versionId;
      // Mirrors materialize_design_screen_generate's append_design_screen_event
      // call: logged the moment the version lands, actor is the task's
      // initiating user.
      store.designEvents.push({
        id: randomUUID(),
        roomId: pending.roomId,
        screenId: screen.id,
        kind: "version_created",
        messageId: null,
        taskId: pending.taskId,
        versionId,
        actor: pending.initiatedBy,
        createdAt: now,
      });
    }
    pending.ticks += 1;
  }

  // Advance any queued design-system-profile distillation the same way:
  // queued -> running -> completed, appending one profile version and
  // activating it on completion -- the same materialization a real
  // distillation settle would perform. useDesignProfileDistillation's own
  // poll of getDesignProfileDistillation then sees a non-null versionId and
  // delivers.
  for (const pending of store.pendingDesignProfileDistillations) {
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
    if (pending.ticks < 1) {
      status.status = "running";
      status.updatedAt = new Date().toISOString();
    } else {
      status.status = "completed";
      status.updatedAt = new Date().toISOString();
      pending.done = true;
      const versionId = randomUUID();
      store.designSystemProfileVersions.push({
        id: versionId,
        workspaceId: pending.workspaceId,
        tokenCss: ":root { --ds-color-primary: rebeccapurple; }",
      });
      const profile = store.designSystemProfiles.find(
        (candidate) => candidate.workspaceId === pending.workspaceId,
      );
      if (profile) {
        profile.activeVersionId = versionId;
      } else {
        store.designSystemProfiles.push({
          workspaceId: pending.workspaceId,
          activeVersionId: versionId,
        });
      }
    }
    pending.ticks += 1;
  }

  return projectFakeRoomTaskStatuses(roomId, store);
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

// Answering a Product Agent proposal, the fake half of the three RPCs in
// proposals.ts. They share one shape: find the proposal, insist the caller
// participates in its Room, do the thing the proposal describes exactly once
// for the Room, and record this caller's own answer.

async function requireProposalMessage(
  messageId: string,
  kind?: RoomProposedAction["kind"],
) {
  const message = getStore().messages.find(
    (candidate) => candidate.id === messageId,
  );
  if (!message?.proposedAction) throw new Error("Proposal not found");
  if (kind && message.proposedAction.kind !== kind) {
    throw new Error("Proposal kind mismatch");
  }
  const { context, participant } = await requireParticipant(message.roomId);
  return { message, action: message.proposedAction, context, participant };
}

function recordFakeProposalResponse(
  messageId: string,
  userId: string,
  response: ProposalResponse,
): ProposalResponse {
  const store = getStore();
  const existing = store.proposalResponses.find(
    (candidate) =>
      candidate.messageId === messageId && candidate.userId === userId,
  );
  if (!existing) {
    store.proposalResponses.push({ messageId, userId, response });
    return response;
  }
  // Dismissal never overwrites an acceptance: the artifact that acceptance
  // created is already durable, so hiding the control cannot un-say it.
  if (response === "accepted") existing.response = "accepted";
  return existing.response;
}

export async function fakeDismissMessageProposal(
  messageId: string,
): Promise<ProposalResponse> {
  const { context } = await requireProposalMessage(messageId);
  return recordFakeProposalResponse(
    messageId,
    context.user.id,
    "dismissed",
  );
}

export async function fakeCaptureProposedDecision(
  messageId: string,
): Promise<{ id: string; summary: string }> {
  const { message, action, context } = await requireProposalMessage(
    messageId,
    "decision_capture",
  );
  if (action.kind !== "decision_capture") {
    throw new Error("Decision proposal required");
  }
  const store = getStore();
  const captured =
    store.decisions.find(
      (decision) => decision.proposalMessageId === messageId,
    ) ??
    (() => {
      const decision: FakeDecision = {
        id: randomUUID(),
        roomId: message.roomId,
        sourceMessageId: action.sourceMessageId ?? undefined,
        // The Decision the room reads is the one the proposal described,
        // trimmed the same way the contract trims it.
        summary: action.summary.trim(),
        createdBy: context.user.id,
        createdAt: new Date().toISOString(),
        proposalMessageId: messageId,
      };
      store.decisions.push(decision);
      return decision;
    })();
  recordFakeProposalResponse(messageId, context.user.id, "accepted");
  return { id: captured.id, summary: captured.summary };
}

export async function fakeAcceptProposedUserFlow(
  messageId: string,
): Promise<{ roomId: string; taskId: string }> {
  const { message, context, participant } = await requireProposalMessage(
    messageId,
    "user_flow_generate",
  );
  if (participant.access !== "edit") {
    throw new Error("Room edit access required");
  }
  const lifecycle = await fakeStartUserFlow(message.roomId);
  const { fakeQueueUserFlowGeneration } = await import(
    "@/features/canvas/e2e-fake"
  );
  const task = fakeQueueUserFlowGeneration({
    roomId: message.roomId,
    sourceMessageId: messageId,
  });
  recordFakeProposalResponse(messageId, context.user.id, "accepted");
  return { roomId: lifecycle.roomId, taskId: task.id };
}

export async function fakeListRoomProposalResponses(
  roomId: string,
): Promise<Record<string, ProposalResponse>> {
  const { context } = await requireParticipant(roomId);
  const store = getStore();
  const roomMessageIds = new Set(
    store.messages
      .filter((message) => message.roomId === roomId)
      .map((message) => message.id),
  );
  const responses: Record<string, ProposalResponse> = {};
  for (const entry of store.proposalResponses) {
    if (
      entry.userId === context.user.id &&
      roomMessageIds.has(entry.messageId)
    ) {
      responses[entry.messageId] = entry.response;
    }
  }
  return responses;
}
