import "server-only";

import type { RoomTaskStatus } from "@/features/ai/room-task-status";
import type { DiscoveryAttachmentView } from "./attachment-types";
import { isDiscoveryFakeEnabled } from "./e2e-gate";
import type { DiscoveryMessage, DiscoveryRoom } from "./repository";
import type {
  AttachmentInput,
  DecisionInput,
  DiscoveryRoomInput,
  EvidenceInput,
  MessageInput,
  ParticipantInput,
} from "./schemas";

// Discovery persistence, behind one interface with two implementations:
// Supabase in every real environment, an in-memory store under the e2e
// fake. Actions and queries above this line talk only to the interface, so
// the swap happens once -- in getDiscoveryBackend below -- instead of at
// every call site.

export type RealtimeMode = "development-poll" | "production";

export type RoomInviteCandidate = {
  userId: string;
  email: string;
};

export type DiscoveryParticipantView = {
  roomId: string;
  userId: string;
  access: "view" | "edit";
  email: string;
};

// Only what the room page actually reads. Both backends return more
// alongside it (evidence, decisions, members, raw attachment rows), but
// nothing renders those and the two disagree on their shape, so they stay
// out of the contract rather than being falsely typed as interchangeable.
export type DiscoveryRoomPageData = {
  room: {
    id: string;
    organizationId: string;
    name: string;
    ownerId: string;
    createdAt: string;
  };
  currentUser: { id: string; email: string; name: string };
  participants: DiscoveryParticipantView[];
  messages: DiscoveryMessage[];
  realtimeMode: RealtimeMode;
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

export type DiscoveryBackend = {
  listRooms(organizationId: string): Promise<DiscoveryRoom[]>;
  getRoomPageData(input: {
    organizationId: string;
    roomId: string;
  }): Promise<DiscoveryRoomPageData | null>;
  createRoom(input: DiscoveryRoomInput): Promise<DiscoveryRoom>;
  deleteRoom(input: {
    organizationId: string;
    roomId: string;
  }): Promise<void>;
  addParticipant(
    input: ParticipantInput,
  ): Promise<RoomParticipantRecord>;
  listMessages(roomId: string): Promise<DiscoveryMessage[]>;
  listRoomTaskStatuses(roomId: string): Promise<RoomTaskStatus[]>;
  postMessage(input: MessageInput): Promise<DiscoveryMessage>;
  addEvidence(input: EvidenceInput): Promise<unknown>;
  addDecision(input: DecisionInput): Promise<unknown>;
  uploadAttachment(upload: AttachmentUpload): Promise<{
    id: string;
    originalName: string;
    extractionStatus: string;
  }>;
  stageAttachment(
    upload: AttachmentUpload,
  ): Promise<DiscoveryAttachmentView>;
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
    organizationId: string,
  ): Promise<RoomInviteCandidate[]>;
};

// The only place the e2e fake is selected. Both implementations are loaded
// lazily so the fake and its in-memory store stay out of the real bundle.
export async function getDiscoveryBackend(): Promise<DiscoveryBackend> {
  if (isDiscoveryFakeEnabled()) {
    const { createFakeDiscoveryBackend } = await import("./fake-backend");
    return createFakeDiscoveryBackend();
  }
  const { createSupabaseDiscoveryBackend } = await import(
    "./supabase-backend"
  );
  return createSupabaseDiscoveryBackend();
}
