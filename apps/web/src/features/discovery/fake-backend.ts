import "server-only";

import {
  getFakeUser,
  listFakeOrganizationPeople,
} from "@/features/workspaces/e2e-fake";
import type { RoomPrd } from "@/features/prd/schemas";
import type {
  DiscoveryBackend,
  RoomInviteCandidate,
} from "./backend";
import {
  E2E_DISCOVERY_ROOM_ID,
  fakeAddDecision,
  fakeAddEvidence,
  fakeAddParticipant,
  fakeCreateRoom,
  fakeDeleteRoom,
  fakeDiscardStagedAttachment,
  fakeGetRoom,
  fakeLinkStagedAttachments,
  fakeListMessages,
  fakeListMessageAttachments,
  fakeListRooms,
  fakeListRoomTaskStatuses,
  fakePostMessage,
  fakeStageAttachment,
} from "./e2e-fake";

const SEEDED_PRD: RoomPrd = {
  id: "50000000-0000-4000-8000-000000000001",
  roomId: E2E_DISCOVERY_ROOM_ID,
  version: 1,
  status: "draft",
  document: {
    title: "Checkout redesign",
    executiveSummary:
      "Reduce checkout friction while preserving customer trust.",
    problemAndEvidence: "Customers abandon checkout when costs appear late.",
    targetUsersAndUseCases: "Returning shoppers completing a mobile purchase.",
    goalsNonGoalsAndMetrics:
      "Increase completed checkouts without adding promotions.",
    proposedSolution:
      "Show a concise, transparent order summary throughout checkout.",
    userJourneys:
      "A shopper reviews costs, confirms delivery, and completes payment.",
    functionalRequirements: ["Keep the order total visible at every step."],
    nonFunctionalRequirements: ["Preserve keyboard and screen-reader access."],
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
  ownerId: "10000000-0000-4000-8000-000000000001",
  createdAt: "2026-08-02T10:35:00.000Z",
  updatedAt: "2026-08-02T10:35:00.000Z",
};

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
        hasPrd: input.roomId === E2E_DISCOVERY_ROOM_ID,
        // The fake store has no Postgres changefeed behind it, so the
        // conversation polls instead of subscribing.
        realtimeMode: "development-poll",
      };
    },

    async getRoomPrd(input) {
      // Mirror the real backend's participant-scoped read before exposing the
      // deterministic document used by the browser regression.
      await fakeGetRoom(input.roomId);
      return input.roomId === E2E_DISCOVERY_ROOM_ID ? SEEDED_PRD : null;
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
