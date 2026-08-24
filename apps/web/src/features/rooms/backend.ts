import "server-only";

import type { RoomTaskStatus } from "@/features/ai/room-task-status";
import type {
  DesignHandoffView,
  FreeformDocument,
  PRDDocument,
  RoomStage,
} from "@meld/contracts";
import type {
  PrdAssistRequest,
  PrdProposal,
  RoomPrd,
} from "@/features/prd/schemas";
import type { PaneLayout } from "./pane-layout";
import type { RoomAttachmentView } from "./attachment-types";
import { isRoomFakeEnabled } from "./e2e-gate";
import type { RoomMessage, Room } from "./repository";
import type { RoomTab } from "./room-tabs-repository";
import type { RoomSurfaceState } from "./surfaces";
import type { RoomDecision, RoomOverviewData } from "./overview";
import type { StageReadinessSignals } from "./stage-readiness";
import type {
  AttachmentInput,
  DecisionInput,
  RoomInput,
  EvidenceInput,
  MessageInput,
  MoveRoomInput,
  ParticipantInput,
  RemoveParticipantInput,
  SetRoomChecklistItemInput,
  SetRoomStageInput,
} from "./schemas";

// Room persistence, behind one interface with two implementations:
// Supabase in every real environment, an in-memory store under the e2e
// fake. Actions and queries above this line talk only to the interface, so
// the swap happens once -- in getRoomBackend below -- instead of at
// every call site.

export type RealtimeMode = "development-poll" | "production";

export type RoomInviteCandidate = {
  userId: string;
  email: string;
};

export type RoomParticipantView = {
  roomId: string;
  userId: string;
  access: "view" | "edit";
  email: string;
  // Workspace role and product role, surfaced as the mention subtext so a
  // teammate reads as e.g. "Product designer" or "Admin" rather than a generic
  // label. Both are optional -- a member may have no product role set.
  role?: "admin" | "member";
  productRole?: string | null;
};

// Only what the room page actually reads. Both backends return more
// alongside it (evidence, decisions, members, raw attachment rows), but
// nothing renders those and the two disagree on their shape, so they stay
// out of the contract rather than being falsely typed as interchangeable.
export type RoomPageData = {
  room: {
    id: string;
    workspaceId: string;
    projectId: string;
    name: string;
    ownerId: string;
    stage: RoomStage;
    createdAt: string;
    updatedAt: string;
  };
  currentUser: { id: string; email: string; name: string };
  participants: RoomParticipantView[];
  messages: RoomMessage[];
  hasPrd: boolean;
  hasUserFlow: boolean;
  activePrdTaskIds: string[];
  activeUserFlowTaskIds: string[];
  surfaceState: RoomSurfaceState;
  // Signals the stage-coaching panel folds into its checklist. Computed here so
  // the panel never reaches into repositories itself.
  stageReadiness: StageReadinessSignals;
  isCurrentUserWorkspaceAdmin: boolean;
  realtimeMode: RealtimeMode;
  // The latest immutable Design -> Development snapshot, if the Room has ever
  // moved into Development. Null before that first move (or if no snapshot
  // was recorded). The Development-stage coaching panel renders its handoff
  // summary from this rather than re-deriving it from live tables.
  designHandoff: DesignHandoffView | null;
};

// Text extraction runs above the backend -- it is the same work whichever
// store the bytes end up in -- so both implementations receive the result.
export type AttachmentUpload = {
  metadata: AttachmentInput;
  bytes: Uint8Array;
  extractedText: string | null;
};

export type RoomParticipantRecord = {
  room_id: string;
  user_id: string;
  access: string;
};

export type RoomBackend = {
  listRooms(workspaceId: string): Promise<Room[]>;
  getRoomPageData(input: {
    workspaceId: string;
    roomId: string;
    includeMessages?: boolean;
    requestedSurface?: unknown;
  }): Promise<RoomPageData | null>;
  listRoomDecisions(roomId: string): Promise<RoomDecision[]>;
  getRoomOverview(roomId: string): Promise<RoomOverviewData>;
  getRoomPrd(input: { roomId: string }): Promise<RoomPrd | null>;
  getRoomPrdHistory(input: { roomId: string }): Promise<RoomPrd[]>;
  saveRoomPrdVersion(input: {
    roomId: string;
    baseVersion: number;
    document: PRDDocument;
  }): Promise<RoomPrd>;
  autosaveRoomPrdDocument(input: {
    roomId: string;
    basePrdId: string | null;
    baseVersion: number;
    baseUpdatedAt: string | null;
    document: FreeformDocument;
  }): Promise<RoomPrd>;
  acceptRoomPrdVersion(input: {
    roomId: string;
    prdId: string;
  }): Promise<RoomPrd>;
  getPrdAssistRequest(input: {
    roomId: string;
    requestId: string;
  }): Promise<PrdAssistRequest | null>;
  // Recovery after a refresh, so the seam -- not every caller -- is what knows
  // who the reader is.
  listRoomPrdAssistRequests(input: {
    roomId: string;
  }): Promise<PrdAssistRequest[]>;
  // Closing a settled request so it stops coming back on the next refresh.
  dismissPrdAssistRequest(input: {
    roomId: string;
    requestId: string;
  }): Promise<void>;
  listRoomPrdProposals(roomId: string): Promise<PrdProposal[]>;
  applyPrdProposal(input: { roomId: string; proposalId: string }): Promise<RoomPrd>;
  discardPrdProposal(input: { roomId: string; proposalId: string }): Promise<PrdProposal>;
  createRoom(input: RoomInput): Promise<Room>;
  setRoomStage(input: SetRoomStageInput): Promise<RoomStage>;
  setRoomChecklistItem(
    input: SetRoomChecklistItemInput,
  ): Promise<boolean>;
  moveRoom(input: MoveRoomInput): Promise<string>;
  deleteRoom(input: {
    workspaceId: string;
    roomId: string;
  }): Promise<void>;
  // Tabs are the Room's workstreams -- ordered by position, then id.
  listRoomTabs(roomId: string): Promise<RoomTab[]>;
  createRoomTab(input: { roomId: string; panes?: PaneLayout }): Promise<RoomTab>;
  renameRoomTab(input: { tabId: string; name: string | null }): Promise<void>;
  setRoomTabPanes(input: { tabId: string; panes: PaneLayout }): Promise<void>;
  reorderRoomTabs(input: {
    roomId: string;
    orderedTabIds: string[];
  }): Promise<void>;
  closeRoomTab(input: { tabId: string }): Promise<void>;
  addParticipant(
    input: ParticipantInput,
  ): Promise<RoomParticipantRecord>;
  removeParticipant(input: RemoveParticipantInput): Promise<void>;
  listMessages(roomId: string): Promise<RoomMessage[]>;
  listMessageAttachments(
    roomId: string,
    messageId: string,
  ): Promise<RoomAttachmentView[]>;
  listRoomTaskStatuses(roomId: string): Promise<RoomTaskStatus[]>;
  postMessage(input: MessageInput): Promise<RoomMessage>;
  addEvidence(input: EvidenceInput): Promise<unknown>;
  addDecision(input: DecisionInput): Promise<unknown>;
  uploadAttachment(upload: AttachmentUpload): Promise<{
    id: string;
    originalName: string;
    extractionStatus: string;
  }>;
  stageAttachment(
    upload: AttachmentUpload,
  ): Promise<RoomAttachmentView>;
  linkStagedAttachments(input: {
    roomId: string;
    messageId: string;
    attachmentIds: string[];
    caption: string;
  }): Promise<string[]>;
  discardStagedAttachment(input: {
    roomId: string;
    attachmentId: string;
  }): Promise<void>;
  listInviteCandidates(
    workspaceId: string,
  ): Promise<RoomInviteCandidate[]>;
};

// The only place the e2e fake is selected. Both implementations are loaded
// lazily so the fake and its in-memory store stay out of the real bundle.
export async function getRoomBackend(): Promise<RoomBackend> {
  if (isRoomFakeEnabled()) {
    const { createFakeRoomBackend } = await import("./fake-backend");
    return createFakeRoomBackend();
  }
  const { createSupabaseRoomBackend } = await import(
    "./supabase-backend"
  );
  return createSupabaseRoomBackend();
}
