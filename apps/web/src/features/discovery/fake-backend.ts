import "server-only";

import {
  getFakeUser,
  listFakeOrganizationPeople,
} from "@/features/workspaces/e2e-fake";
import type {
  DiscoveryBackend,
  RoomInviteCandidate,
} from "./backend";
import {
  fakeAddDecision,
  fakeAddEvidence,
  fakeAddParticipant,
  fakeCreateRoom,
  fakeDeleteRoom,
  fakeDiscardStagedAttachment,
  fakeGetRoom,
  fakeGetRoomPrd,
  fakeLinkStagedAttachments,
  fakeListMessages,
  fakeListMessageAttachments,
  fakeListRooms,
  fakeListRoomTaskStatuses,
  fakePostMessage,
  fakeRoomHasPrd,
  fakeStageAttachment,
} from "./e2e-fake";

export function createFakeDiscoveryBackend(): DiscoveryBackend {
  return {
    listRooms(organizationId) {
      return fakeListRooms(organizationId);
    },

    async getRoomPageData(input) {
      let room: Awaited<ReturnType<typeof fakeGetRoom>>;
      try {
        room = await fakeGetRoom(input.roomId);
      } catch {
        // A missing room or a non-participant sends the page home, the
        // same as the Supabase backend returning no row.
        return null;
      }
      return {
        room: room.room,
        currentUser: room.currentUser,
        participants: room.participants,
        messages: room.messages,
        hasPrd: fakeRoomHasPrd(input.roomId),
        // The fake store has no Postgres changefeed behind it, so the
        // conversation polls instead of subscribing.
        realtimeMode: "development-poll",
      };
    },

    getRoomPrd(input) {
      // Participant-scoped read of the in-memory PRD, mirroring the Supabase
      // backend. Seeded for the pre-existing E2E room and materialized for any
      // room whose generation completes.
      return fakeGetRoomPrd(input.roomId);
    },

    createRoom(input) {
      return fakeCreateRoom(input);
    },

    deleteRoom(input) {
      return fakeDeleteRoom(input);
    },

    addParticipant(input) {
      return fakeAddParticipant(input);
    },

    listMessages(roomId) {
      return fakeListMessages(roomId);
    },

    listMessageAttachments(roomId, messageId) {
      return fakeListMessageAttachments(roomId, messageId);
    },

    listRoomTaskStatuses(roomId) {
      return fakeListRoomTaskStatuses(roomId);
    },

    postMessage(input) {
      return fakePostMessage(input);
    },

    addEvidence(input) {
      return fakeAddEvidence(input);
    },

    addDecision(input) {
      return fakeAddDecision(input);
    },

    async uploadAttachment() {
      // Unstaged uploads write straight to Supabase Storage, which the fake
      // has no stand-in for. Callers already treat a throw here as "this
      // file did not attach" rather than as a failed request.
      throw new Error(
        "Attachment persistence requires local Supabase in this test mode.",
      );
    },

    stageAttachment({ metadata, bytes, extractedText }) {
      return fakeStageAttachment({
        roomId: metadata.roomId,
        originalName: metadata.fileName,
        mimeType: metadata.mimeType,
        caption: metadata.caption ?? null,
        extractionStatus:
          extractedText === null ? "unsupported" : "ready",
        bytes,
      });
    },

    linkStagedAttachments(input) {
      return fakeLinkStagedAttachments(input);
    },

    discardStagedAttachment(input) {
      return fakeDiscardStagedAttachment(input);
    },

    async listInviteCandidates(organizationId) {
      const [currentUser, people] = await Promise.all([
        getFakeUser(),
        listFakeOrganizationPeople(organizationId),
      ]);
      return (people?.members ?? [])
        .filter((member) => member.user_id !== currentUser?.id)
        .map(
          (member): RoomInviteCandidate => ({
            userId: member.user_id,
            email: member.email,
          }),
        );
    },
  };
}
