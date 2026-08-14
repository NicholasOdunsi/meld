import "server-only";

import { isTerminalTaskStatus } from "@/features/ai/room-task-status";
import {
  getFakeUser,
  listFakeWorkspacePeople,
} from "@/features/workspaces/e2e-fake";
import type {
  RoomBackend,
  RoomInviteCandidate,
} from "./backend";
import {
  fakeAddDecision,
  fakeAddEvidence,
  fakeAddParticipant,
  fakeAcceptRoomPrdVersion,
  fakeCreateRoom,
  fakeDeleteRoom,
  fakeDiscardStagedAttachment,
  fakeGetPrdAssistRequest,
  fakeGetRoom,
  fakeGetRoomTaskStatuses,
  fakeGetRoomPrd,
  fakeDismissPrdAssistRequest,
  fakeListRoomPrdAssistRequests,
  fakeListRoomPrdHistory,
  fakeListRoomPrdProposals,
  fakeApplyPrdProposal,
  fakeDiscardPrdProposal,
  fakeLinkStagedAttachments,
  fakeListMessages,
  fakeListMessageAttachments,
  fakeListRooms,
  fakeListRoomTaskStatuses,
  fakeListRoomDecisions,
  fakeGetRoomOverview,
  fakeMoveRoom,
  fakePostMessage,
  fakeRemoveParticipant,
  fakeRoomHasPrd,
  fakeRoomHasBuiltDesignScreen,
  fakeRoomBuiltDesignScreenCount,
  fakeRoomDesignReferenceCount,
  fakeRoomLatestDesignRevisionAt,
  fakeRoomHasUserFlow,
  fakeSaveRoomPrdVersion,
  fakeSetRoomStage,
  fakeStageAttachment,
} from "./e2e-fake";
import { getRoomSurfaces, resolveRoomSurface } from "./surfaces";
import {
  manualChecksFromKeys,
  type StageReadinessSignals,
} from "./stage-readiness";

// The in-memory store behind the fake has no checklist table; a module-level map
// keyed by room is enough for the e2e path to round-trip a manual
// confirmation. Each item key maps to the ISO timestamp it was checked at, so
// `designReviewedAt` can read the same store the manual checks are folded
// from, mirroring `room_stage_checklist_items.checked_at`.
const fakeChecklistKeys = new Map<string, Map<string, string>>();

export function createFakeRoomBackend(): RoomBackend {
  return {
    listRooms(workspaceId) {
      return fakeListRooms(workspaceId);
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
      if (room.room.workspaceId !== input.workspaceId) return null;
      const taskStatuses = await fakeGetRoomTaskStatuses(input.roomId);
      const activePrdTaskIds = taskStatuses
        .filter(
          (task) =>
            task.kind === "prd_generate" &&
            task.status !== "completed" &&
            task.status !== "cancelled",
        )
        .map((task) => task.taskId);
      const activeUserFlowTaskIds = taskStatuses
        .filter(
          (task) =>
            task.kind === "user_flow_generate" &&
            task.initiatingUserId === room.currentUser.id &&
            !isTerminalTaskStatus(task.status),
        )
        .map((task) => task.taskId);
      const surfaceState = {
        hasPrd: fakeRoomHasPrd(input.roomId),
        hasPrdTask: activePrdTaskIds.length > 0,
        hasUserFlow: fakeRoomHasUserFlow(input.roomId),
        hasBuiltDesignScreen: fakeRoomHasBuiltDesignScreen(input.roomId),
        decisionCount: room.decisions.length,
        stage: room.room.stage,
      };
      const { activeSurface } = resolveRoomSurface(
        input.requestedSurface,
        getRoomSurfaces(surfaceState),
      );
      const includeMessages =
        input.includeMessages ?? (activeSurface === "conversation");
      const prd = await fakeGetRoomPrd(input.roomId);
      const checklist = fakeChecklistKeys.get(input.roomId);
      const stageReadiness: StageReadinessSignals = {
        participantCount: room.participants.length,
        hasHumanMessage: room.messages.some(
          (message) => message.authorType === "human",
        ),
        hasAgentReply: room.messages.some(
          (message) => message.authorType !== "human",
        ),
        hasPrd: surfaceState.hasPrd,
        prdStatus: prd?.status ?? null,
        userFlowCount: surfaceState.hasUserFlow ? 1 : 0,
        decisionCount: room.decisions.length,
        designAssetCount: room.attachments.length,
        manualChecks: manualChecksFromKeys([...(checklist?.keys() ?? [])]),
        builtScreenCount: fakeRoomBuiltDesignScreenCount(input.roomId),
        designReferenceCount: fakeRoomDesignReferenceCount(input.roomId),
        // No fake design-system profile store exists yet -- every fake room
        // reports no active profile until one is added.
        hasDesignProfile: false,
        designReviewedAt: checklist?.get("design_reviewed") ?? null,
        latestDesignRevisionAt: fakeRoomLatestDesignRevisionAt(input.roomId),
      };
      return {
        room: room.room,
        currentUser: room.currentUser,
        participants: room.participants,
        messages: includeMessages ? room.messages : [],
        hasPrd: surfaceState.hasPrd,
        hasUserFlow: surfaceState.hasUserFlow,
        activePrdTaskIds,
        activeUserFlowTaskIds,
        surfaceState,
        stageReadiness,
        isCurrentUserWorkspaceAdmin: room.isCurrentUserWorkspaceAdmin,
        // The fake store has no Postgres changefeed behind it, so the
        // conversation polls instead of subscribing.
        realtimeMode: "development-poll",
      };
    },

    listRoomDecisions(roomId) {
      return fakeListRoomDecisions(roomId);
    },

    getRoomOverview(roomId) {
      return fakeGetRoomOverview(roomId);
    },

    getRoomPrd(input) {
      // Participant-scoped read of the in-memory PRD, mirroring the Supabase
      // backend. Seeded for the pre-existing E2E room and materialized for any
      // room whose generation completes.
      return fakeGetRoomPrd(input.roomId);
    },

    getRoomPrdHistory(input) {
      return fakeListRoomPrdHistory(input.roomId);
    },

    saveRoomPrdVersion(input) {
      return fakeSaveRoomPrdVersion(input);
    },

    acceptRoomPrdVersion(input) {
      return fakeAcceptRoomPrdVersion(input);
    },

    getPrdAssistRequest(input) {
      return fakeGetPrdAssistRequest(input);
    },

    listRoomPrdAssistRequests(input) {
      return fakeListRoomPrdAssistRequests(input);
    },

    dismissPrdAssistRequest(input) {
      return fakeDismissPrdAssistRequest(input);
    },

    listRoomPrdProposals(roomId) {
      return fakeListRoomPrdProposals(roomId);
    },

    applyPrdProposal(input) {
      return fakeApplyPrdProposal(input);
    },

    discardPrdProposal(input) {
      return fakeDiscardPrdProposal(input);
    },

    createRoom(input) {
      return fakeCreateRoom(input);
    },

    setRoomStage(input) {
      return fakeSetRoomStage(input);
    },

    async setRoomChecklistItem(input) {
      const keys =
        fakeChecklistKeys.get(input.roomId) ?? new Map<string, string>();
      if (input.checked) {
        keys.set(input.itemKey, new Date().toISOString());
      } else {
        keys.delete(input.itemKey);
      }
      fakeChecklistKeys.set(input.roomId, keys);
      return input.checked;
    },

    moveRoom(input) {
      return fakeMoveRoom(input);
    },

    deleteRoom(input) {
      return fakeDeleteRoom(input);
    },

    addParticipant(input) {
      return fakeAddParticipant(input);
    },

    removeParticipant(input) {
      return fakeRemoveParticipant(input.roomId, input.userId);
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

    async listInviteCandidates(workspaceId) {
      const [currentUser, people] = await Promise.all([
        getFakeUser(),
        listFakeWorkspacePeople(workspaceId),
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
