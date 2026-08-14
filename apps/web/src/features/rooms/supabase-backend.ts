import "server-only";

import { randomUUID } from "node:crypto";
import { RoomStageSchema } from "@meld/contracts";
import {
  isTerminalTaskStatus,
  listRoomAiTaskStatuses,
} from "@/features/ai/room-task-status";
import { createPrdRepository } from "@/features/prd/repository";
import type { RoomAttachmentView } from "./attachment-types";
import type {
  AttachmentUpload,
  RoomBackend,
  RoomInviteCandidate,
} from "./backend";
import type { RoomMessage } from "./repository";
import { getRoomSurfaces, resolveRoomSurface } from "./surfaces";
import { getAuthenticatedRepository } from "./session";
import { persistAttachmentUpload } from "./upload-persistence";
import {
  buildRoomOverview,
  sortRoomDecisions,
  type RoomDecision,
} from "./overview";
import {
  manualChecksFromKeys,
  type StageReadinessSignals,
} from "./stage-readiness";

const ATTACHMENT_BUCKET = "discovery-attachments";

const SIGNED_URL_TTL_SECONDS = 60 * 60;
const POSTGREST_PAGE_SIZE = 1000;
const ROOM_PEOPLE_CHUNK_SIZE = 500;

// The later of two nullable ISO timestamps -- both reads are optional (a room
// can have screen versions, references, both, or neither), so this only
// compares string values that are actually present.
function latestOf(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a > b ? a : b;
}

type DecisionRow = {
  id: string;
  source_message_id: string | null;
  summary: string;
  created_by: string;
  created_at: string;
};

type ParticipantRow = {
  user_id: string;
  access: "view" | "edit";
  created_at: string;
};

export async function createSupabaseRoomBackend(): Promise<RoomBackend> {
  // Authenticated once per request here rather than per operation, so a
  // caller that writes a room and then invites several people pays for one
  // session verification instead of one per write.
  const { supabase, user, repository } =
    await getAuthenticatedRepository();
  const prdRepository = createPrdRepository(supabase);

  // Resolved per call rather than up front: constructing the backend should
  // not require a storage handle for operations that never touch one.
  const attachmentStorage = () =>
    supabase.storage.from(ATTACHMENT_BUCKET);

  async function persistAttachment(upload: AttachmentUpload) {
    const { metadata, bytes, extractedText } = upload;
    const id = randomUUID();
    const safeName = metadata.fileName
      .normalize("NFKC")
      .replace(/[^A-Za-z0-9._-]/g, "_")
      .slice(0, 120);
    const storagePath = `${metadata.roomId}/${id}/${safeName}`;
    const saved = await persistAttachmentUpload({
      attachment: {
        ...metadata,
        id,
        storagePath,
        extractionStatus:
          extractedText === null ? "unsupported" : "ready",
        extractedText,
      },
      bytes,
      repository,
      storage: attachmentStorage(),
    });
    const view: RoomAttachmentView = {
      id: saved.id as string,
      messageId:
        typeof saved.message_id === "string"
          ? saved.message_id
          : metadata.messageId ?? null,
      originalName: saved.original_name as string,
      mimeType:
        typeof saved.mime_type === "string"
          ? saved.mime_type
          : metadata.mimeType,
      caption:
        typeof saved.caption === "string"
          ? saved.caption
          : metadata.caption ?? null,
      extractionStatus: saved.extraction_status as string,
      viewUrl: null,
    };
    return { storagePath, view };
  }

  // Batch-sign a set of linked attachment rows into view models. A private
  // bucket means every viewUrl is a short-lived signed URL; a row that fails to
  // sign simply carries a null viewUrl rather than dropping the attachment.
  //
  // SVGs are signed with a download disposition: an SVG can embed scripts, and
  // opening one inline (as a document) would execute them in the storage
  // origin. Forcing Content-Disposition: attachment means any direct navigation
  // downloads the file instead of rendering it, while the chat still shows it
  // through <img>, which runs SVG in a safe static mode that never executes
  // scripts. Non-SVG types keep their inline URL (a PDF should still open in a
  // tab). The two groups are signed separately because the download option
  // applies to a whole batch.
  async function signLinkedRows(
    rows: Awaited<
      ReturnType<typeof repository.listRoomLinkedAttachments>
    >,
  ): Promise<RoomAttachmentView[]> {
    if (rows.length === 0) return [];
    const urlByPath = new Map<string, string | null>();
    const collect = (
      data: Array<{
        path?: string | null;
        signedUrl?: string | null;
      }> | null,
    ) => {
      for (const entry of data ?? []) {
        if (entry.path) {
          urlByPath.set(entry.path, entry.signedUrl ?? null);
        }
      }
    };

    const svgPaths = rows
      .filter((row) => row.mime_type === "image/svg+xml")
      .map((row) => row.storage_path);
    const inlinePaths = rows
      .filter((row) => row.mime_type !== "image/svg+xml")
      .map((row) => row.storage_path);

    if (inlinePaths.length > 0) {
      const signed = await attachmentStorage().createSignedUrls(
        inlinePaths,
        SIGNED_URL_TTL_SECONDS,
      );
      collect(signed.data);
    }
    if (svgPaths.length > 0) {
      const signed = await attachmentStorage().createSignedUrls(
        svgPaths,
        SIGNED_URL_TTL_SECONDS,
        { download: true },
      );
      collect(signed.data);
    }

    return rows.map((row) => ({
      id: row.id,
      messageId: row.message_id,
      originalName: row.original_name,
      mimeType: row.mime_type,
      caption: row.caption,
      extractionStatus: row.extraction_status,
      viewUrl: urlByPath.get(row.storage_path) ?? null,
    }));
  }

  // Resolve every message's linked attachments in one pass: fetch the room's
  // linked rows, batch-sign them, and hang the signed views off the message
  // they belong to. A room with no attachments skips the storage round-trip.
  async function withMessageAttachments(
    roomId: string,
    messages: RoomMessage[],
  ): Promise<RoomMessage[]> {
    if (messages.length === 0) return messages;
    const views = await signLinkedRows(
      await repository.listRoomLinkedAttachments(roomId),
    );
    if (views.length === 0) return messages;

    const viewsByMessage = new Map<string, RoomAttachmentView[]>();
    for (const view of views) {
      if (view.messageId === null) continue;
      const list = viewsByMessage.get(view.messageId) ?? [];
      list.push(view);
      viewsByMessage.set(view.messageId, list);
    }

    return messages.map((message) => ({
      ...message,
      attachments: viewsByMessage.get(message.id) ?? [],
    }));
  }

  async function listDecisionRows(roomId: string): Promise<DecisionRow[]> {
    const rows: DecisionRow[] = [];
    for (let offset = 0; ; offset += POSTGREST_PAGE_SIZE) {
      const result = await supabase
        .from("decisions")
        .select("id,source_message_id,summary,created_by,created_at")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + POSTGREST_PAGE_SIZE - 1);
      if (result.error) {
        throw new Error("We could not load the Room's decisions.");
      }
      const page = (result.data ?? []) as DecisionRow[];
      rows.push(...page);
      if (page.length < POSTGREST_PAGE_SIZE) break;
    }
    return rows;
  }

  async function listParticipantRows(
    roomId: string,
  ): Promise<ParticipantRow[]> {
    const rows: ParticipantRow[] = [];
    for (let offset = 0; ; offset += POSTGREST_PAGE_SIZE) {
      const result = await supabase
        .from("room_participants")
        .select("user_id,access,created_at")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true })
        .order("user_id", { ascending: true })
        .range(offset, offset + POSTGREST_PAGE_SIZE - 1);
      if (result.error) {
        throw new Error("We could not load the Room overview.");
      }
      const page = (result.data ?? []) as ParticipantRow[];
      rows.push(...page);
      if (page.length < POSTGREST_PAGE_SIZE) break;
    }
    return rows;
  }

  async function resolveRoomPeople(
    roomId: string,
    requestedUserIds: readonly string[],
  ): Promise<Map<string, string>> {
    const userIds = [...new Set(requestedUserIds)];
    const people = new Map<string, string>();
    for (
      let offset = 0;
      offset < userIds.length;
      offset += ROOM_PEOPLE_CHUNK_SIZE
    ) {
      const result = await supabase.rpc("list_room_people", {
        target_room_id: roomId,
        target_user_ids: userIds.slice(offset, offset + ROOM_PEOPLE_CHUNK_SIZE),
      });
      if (result.error) {
        throw new Error("We could not resolve the Room's people.");
      }
      for (const person of (result.data ?? []) as Array<{
        user_id: string;
        email: string;
      }>) {
        people.set(person.user_id, person.email);
      }
    }
    return people;
  }

  function mapDecisionRows(
    rows: readonly DecisionRow[],
    personNameById: ReadonlyMap<string, string>,
  ): RoomDecision[] {
    return sortRoomDecisions(
      rows.map((decision) => ({
        id: decision.id,
        sourceMessageId: decision.source_message_id,
        summary: decision.summary,
        createdAt: decision.created_at,
        createdByName:
          personNameById.get(decision.created_by) ?? "Unknown member",
      })),
    );
  }

  return {
    listRooms(workspaceId) {
      return repository.listRooms(workspaceId);
    },

    setRoomStage(input) {
      return repository.setRoomStage(input);
    },

    setRoomChecklistItem(input) {
      return repository.setRoomChecklistItem(input);
    },

    moveRoom(input) {
      return repository.moveRoom(input);
    },

    async getRoomPageData(input) {
      const roomResult = await supabase
        .from("rooms")
        .select("id,workspace_id,project_id,name,owner_id,stage,created_at,updated_at")
        .eq("id", input.roomId)
        .eq("workspace_id", input.workspaceId)
        .maybeSingle();
      if (roomResult.error || !roomResult.data) return null;
      const roomStage = RoomStageSchema.parse(roomResult.data.stage);

      const [
        hasPrd,
        userFlowResult,
        builtScreenCountResult,
        decisionsResult,
        taskStatuses,
        humanMessageResult,
        agentMessageResult,
        attachmentsResult,
        prdStatusResult,
        checklistResult,
        designReferenceCountResult,
        designProfileResult,
        latestScreenVersionResult,
        latestDesignReferenceResult,
      ] = await Promise.all([
        prdRepository.roomHasPrd(input.roomId),
        supabase
          .from("user_flows")
          .select("room_id")
          .eq("room_id", input.roomId)
          .maybeSingle(),
        // Built screens feed both `surfaceState.hasBuiltDesignScreen` (any
        // built screen unlocks the Prototype surface) and the readiness
        // signal's exact count, off one count query rather than two reads.
        supabase
          .from("design_screens")
          .select("id", { count: "exact", head: true })
          .eq("room_id", input.roomId)
          .eq("state", "built")
          .is("deleted_at", null),
        supabase
          .from("decisions")
          .select("id", { count: "exact", head: true })
          .eq("room_id", input.roomId),
        listRoomAiTaskStatuses(supabase, input.roomId),
        // Discovery signals: has anyone spoken, and has an agent replied.
        supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("room_id", input.roomId)
          .eq("author_type", "human"),
        supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("room_id", input.roomId)
          .in("author_type", ["product_agent", "research_agent"]),
        // Design assets = attachments already linked to a message. Staged
        // (message_id null) rows belong to an in-flight compose, not the room.
        supabase
          .from("attachments")
          .select("id", { count: "exact", head: true })
          .eq("room_id", input.roomId)
          .not("message_id", "is", null),
        supabase
          .from("prds")
          .select("status")
          .eq("room_id", input.roomId)
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle(),
        // `checked_at` rides along so `designReviewedAt` can read it off the
        // same row the manual checks are folded from, no extra query.
        supabase
          .from("room_stage_checklist_items")
          .select("item_key,checked_at")
          .eq("room_id", input.roomId),
        supabase
          .from("design_references")
          .select("id", { count: "exact", head: true })
          .eq("room_id", input.roomId),
        // Workspace-scoped: `design_system_profiles` is keyed by workspace,
        // not room, so a profile is shared across every room in it.
        supabase
          .from("design_system_profiles")
          .select("active_version_id")
          .eq("workspace_id", input.workspaceId)
          .maybeSingle(),
        supabase
          .from("design_screen_versions")
          .select("created_at")
          .eq("room_id", input.roomId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("design_references")
          .select("created_at")
          .eq("room_id", input.roomId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (
        userFlowResult.error ||
        builtScreenCountResult.error ||
        decisionsResult.error ||
        humanMessageResult.error ||
        agentMessageResult.error ||
        attachmentsResult.error ||
        prdStatusResult.error ||
        checklistResult.error ||
        designReferenceCountResult.error ||
        designProfileResult.error ||
        latestScreenVersionResult.error ||
        latestDesignReferenceResult.error
      ) {
        throw new Error("We could not load the Room's surfaces.");
      }
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
            task.initiatingUserId === user.id &&
            !isTerminalTaskStatus(task.status),
        )
        .map((task) => task.taskId);
      const builtScreenCount = builtScreenCountResult.count ?? 0;
      const surfaceState = {
        hasUserFlow: userFlowResult.data !== null,
        hasPrd,
        hasPrdTask: activePrdTaskIds.length > 0,
        hasBuiltDesignScreen: builtScreenCount > 0,
        decisionCount: decisionsResult.count ?? 0,
        stage: roomStage,
      };
      const { activeSurface } = resolveRoomSurface(
        input.requestedSurface,
        getRoomSurfaces(surfaceState),
      );
      const includeMessages =
        input.includeMessages ?? (activeSurface === "conversation");

      const [messages, participantsResult, membersResult] = await Promise.all([
        includeMessages
          ? repository.listMessages(input.roomId)
          : Promise.resolve([]),
        supabase
          .from("room_participants")
          .select("room_id,user_id,access")
          .eq("room_id", input.roomId),
        supabase.rpc("list_workspace_members", {
          target_workspace_id: input.workspaceId,
        }),
      ]);
      if (participantsResult.error || membersResult.error) {
        throw new Error("We could not load the Room.");
      }
      const members = (membersResult.data ?? []) as Array<{
        user_id: string;
        email: string;
        role?: "admin" | "member";
        product_role?: string | null;
      }>;
      const messagesWithAttachments = await withMessageAttachments(
        input.roomId,
        messages,
      );
      const checklistRows = (checklistResult.data ?? []) as Array<{
        item_key: string;
        checked_at: string;
      }>;
      const latestScreenVersionAt =
        latestScreenVersionResult.data?.created_at ?? null;
      const latestDesignReferenceAt =
        latestDesignReferenceResult.data?.created_at ?? null;
      const stageReadiness: StageReadinessSignals = {
        participantCount: (participantsResult.data ?? []).length,
        hasHumanMessage: (humanMessageResult.count ?? 0) > 0,
        hasAgentReply: (agentMessageResult.count ?? 0) > 0,
        hasPrd,
        prdStatus: prdStatusResult.data
          ? (prdStatusResult.data.status as "draft" | "accepted")
          : null,
        userFlowCount: userFlowResult.data !== null ? 1 : 0,
        decisionCount: decisionsResult.count ?? 0,
        designAssetCount: attachmentsResult.count ?? 0,
        manualChecks: manualChecksFromKeys(
          checklistRows.map((row) => row.item_key),
        ),
        builtScreenCount,
        designReferenceCount: designReferenceCountResult.count ?? 0,
        hasDesignProfile: Boolean(designProfileResult.data?.active_version_id),
        designReviewedAt:
          checklistRows.find((row) => row.item_key === "design_reviewed")
            ?.checked_at ?? null,
        latestDesignRevisionAt: latestOf(
          latestScreenVersionAt,
          latestDesignReferenceAt,
        ),
      };
      return {
        room: {
          id: roomResult.data.id,
          workspaceId: roomResult.data.workspace_id,
          projectId: roomResult.data.project_id,
          name: roomResult.data.name,
          ownerId: roomResult.data.owner_id,
          stage: roomStage,
          createdAt: roomResult.data.created_at,
          updatedAt: roomResult.data.updated_at,
        },
        currentUser: {
          id: user.id,
          email: user.email ?? "Room participant",
          name:
            (typeof user.user_metadata?.full_name === "string" &&
              user.user_metadata.full_name) ||
            user.email ||
            "Room participant",
        },
        participants: (participantsResult.data ?? []).map(
          (participant) => {
            const member = members.find(
              (candidate) => candidate.user_id === participant.user_id,
            );
            return {
              roomId: participant.room_id,
              userId: participant.user_id,
              access: participant.access as "view" | "edit",
              email: member?.email ?? "Room participant",
              role: member?.role,
              productRole: member?.product_role ?? null,
            };
          },
        ),
        messages: messagesWithAttachments,
        hasPrd,
        hasUserFlow: userFlowResult.data !== null,
        activePrdTaskIds,
        activeUserFlowTaskIds,
        surfaceState,
        stageReadiness,
        isCurrentUserWorkspaceAdmin: members.some(
          (member) => member.user_id === user.id && member.role === "admin",
        ),
        realtimeMode: "production" as const,
      };
    },

    async listRoomDecisions(roomId) {
      const roomResult = await supabase
        .from("rooms")
        .select("id")
        .eq("id", roomId)
        .maybeSingle();
      if (roomResult.error || !roomResult.data) {
        throw new Error("We could not load the Room's decisions.");
      }
      const rows = await listDecisionRows(roomId);
      const people = await resolveRoomPeople(
        roomId,
        rows.map((row) => row.created_by),
      );
      return mapDecisionRows(rows, people);
    },

    async getRoomOverview(roomId) {
      const roomResult = await supabase
        .from("rooms")
        .select("stage,created_at,updated_at")
        .eq("id", roomId)
        .maybeSingle();
      if (roomResult.error || !roomResult.data) {
        throw new Error("We could not load the Room overview.");
      }

      const [
        participantRows,
        participantCountResult,
        messagesResult,
        stageEventsResult,
        userFlowCountResult,
        latestUserFlowResult,
        prdCountResult,
        latestPrdResult,
        decisionCountResult,
        recentDecisionResult,
      ] = await Promise.all([
        listParticipantRows(roomId),
        supabase
          .from("room_participants")
          .select("user_id", { count: "exact", head: true })
          .eq("room_id", roomId),
        supabase
          .from("messages")
          .select("created_at")
          .eq("room_id", roomId)
          .order("created_at", { ascending: false })
          .limit(1),
        supabase
          .from("room_stage_events")
          .select("created_at")
          .eq("room_id", roomId)
          .order("created_at", { ascending: false })
          .limit(1),
        supabase
          .from("user_flows")
          .select("room_id", { count: "exact", head: true })
          .eq("room_id", roomId),
        supabase
          .from("user_flows")
          .select("created_at")
          .eq("room_id", roomId)
          .order("created_at", { ascending: false })
          .limit(1),
        supabase
          .from("prds")
          .select("id", { count: "exact", head: true })
          .eq("room_id", roomId),
        supabase
          .from("prds")
          .select("created_at,updated_at")
          .eq("room_id", roomId)
          .order("updated_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(1),
        supabase
          .from("decisions")
          .select("id", { count: "exact", head: true })
          .eq("room_id", roomId),
        supabase
          .from("decisions")
          .select("id,source_message_id,summary,created_by,created_at")
          .eq("room_id", roomId)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(3),
      ]);
      if (
        participantCountResult.error ||
        messagesResult.error ||
        stageEventsResult.error ||
        userFlowCountResult.error ||
        latestUserFlowResult.error ||
        prdCountResult.error ||
        latestPrdResult.error ||
        decisionCountResult.error ||
        recentDecisionResult.error
      ) {
        throw new Error("We could not load the Room overview.");
      }

      const recentDecisionRows = (recentDecisionResult.data ??
        []) as DecisionRow[];
      const people = await resolveRoomPeople(roomId, [
        ...participantRows.map((participant) => participant.user_id),
        ...recentDecisionRows.map((decision) => decision.created_by),
      ]);
      const decisions = mapDecisionRows(recentDecisionRows, people);

      return buildRoomOverview({
        stage: RoomStageSchema.parse(roomResult.data.stage),
        roomCreatedAt: roomResult.data.created_at,
        roomUpdatedAt: roomResult.data.updated_at,
        activityTimestamps: [
          ...(messagesResult.data ?? []).map((row) => row.created_at),
          ...(stageEventsResult.data ?? []).map((row) => row.created_at),
          ...(latestUserFlowResult.data ?? []).map((row) => row.created_at),
          ...(latestPrdResult.data ?? []).flatMap((row) => [
            row.created_at,
            row.updated_at,
          ]),
          ...decisions.map((decision) => decision.createdAt),
        ],
        participantCount: participantCountResult.count ?? 0,
        participants: participantRows.map((participant) => ({
          userId: participant.user_id,
          email: people.get(participant.user_id) ?? "Unknown member",
          access: participant.access,
        })),
        counts: {
          userFlows: userFlowCountResult.count ?? 0,
          prds: (prdCountResult.count ?? 0) > 0 ? 1 : 0,
          decisions: decisionCountResult.count ?? 0,
        },
        decisions,
      });
    },

    getRoomPrd(input) {
      return prdRepository.getRoomPrd(input.roomId);
    },

    getRoomPrdHistory(input) {
      return prdRepository.getRoomPrdHistory(input.roomId);
    },

    saveRoomPrdVersion(input) {
      return prdRepository.saveRoomPrdVersion(input);
    },

    acceptRoomPrdVersion(input) {
      return prdRepository.acceptRoomPrdVersion(input);
    },

    getPrdAssistRequest(input) {
      return prdRepository.getPrdAssistRequest(input);
    },

    listRoomPrdAssistRequests(input) {
      // The reader is resolved here, from the verified session, rather than
      // being passed in from a caller that could name someone else.
      return prdRepository.listRoomPrdAssistRequests({
        roomId: input.roomId,
        createdBy: user.id,
      });
    },

    dismissPrdAssistRequest(input) {
      return prdRepository.dismissPrdAssistRequest(input);
    },

    listRoomPrdProposals(roomId) {
      return prdRepository.listRoomPrdProposals(roomId);
    },

    applyPrdProposal(input) {
      return prdRepository.applyPrdProposal(input);
    },

    discardPrdProposal(input) {
      return prdRepository.discardPrdProposal(input);
    },

    createRoom(input) {
      return repository.createRoom(input);
    },

    async deleteRoom(input) {
      // Gathered before the delete: cascading FKs remove the attachment
      // rows themselves, so their storage paths would otherwise be
      // unrecoverable.
      const storagePaths = await repository.listAttachmentStoragePaths(
        input.roomId,
      );
      await repository.deleteRoom(input.roomId);
      if (storagePaths.length > 0) {
        await attachmentStorage().remove(storagePaths);
      }
    },

    addParticipant(input) {
      return repository.addParticipant(input);
    },

    removeParticipant(input) {
      return repository.removeParticipant(input);
    },

    async listMessages(roomId) {
      return withMessageAttachments(
        roomId,
        await repository.listMessages(roomId),
      );
    },

    async listMessageAttachments(roomId, messageId) {
      return signLinkedRows(
        await repository.listMessageLinkedAttachments(roomId, messageId),
      );
    },

    listRoomTaskStatuses(roomId) {
      // Reads only the safe, participant-scoped status projection Task 8
      // exposes -- never public.ai_tasks directly.
      return listRoomAiTaskStatuses(supabase, roomId);
    },

    postMessage(input) {
      return repository.postMessage(input);
    },

    addEvidence(input) {
      return repository.addEvidence(input);
    },

    addDecision(input) {
      return repository.addDecision(input);
    },

    async uploadAttachment(upload) {
      const { view } = await persistAttachment(upload);
      return {
        id: view.id,
        originalName: view.originalName,
        extractionStatus: view.extractionStatus,
      };
    },

    async stageAttachment(upload) {
      const { storagePath, view } = await persistAttachment(upload);
      // Match the read path: an SVG's URL forces a download so it can never be
      // opened inline as a script-executing document.
      const signed = await attachmentStorage().createSignedUrl(
        storagePath,
        SIGNED_URL_TTL_SECONDS,
        view.mimeType === "image/svg+xml"
          ? { download: true }
          : undefined,
      );
      return { ...view, viewUrl: signed.data?.signedUrl ?? null };
    },

    async linkStagedAttachments(input) {
      const result = await supabase.rpc(
        "link_staged_room_attachments",
        {
          target_room_id: input.roomId,
          target_message_id: input.messageId,
          target_attachment_ids: input.attachmentIds,
          final_caption: input.caption,
        },
      );
      if (result.error) {
        throw new Error("We could not attach every uploaded file.");
      }
      return (result.data ?? []).map(
        (row: { attachment_id: string }) => row.attachment_id,
      );
    },

    async discardStagedAttachment(input) {
      const claimed =
        await repository.claimStagedAttachmentForDiscard(input);
      if (!claimed) return;
      const removed = await attachmentStorage().remove([claimed.storagePath]);
      if (removed.error) {
        throw new Error("We could not discard the staged attachment.");
      }
      await repository.deleteClaimedStagedAttachment(input);
    },

    async listInviteCandidates(workspaceId) {
      const result = await supabase.rpc("list_workspace_members", {
        target_workspace_id: workspaceId,
      });
      if (result.error) {
        throw new Error("We could not load workspace members.");
      }
      return (result.data ?? [])
        .filter(
          (member: { user_id: string; email: string }) =>
            member.user_id !== user.id,
        )
        .map(
          (member: {
            user_id: string;
            email: string;
          }): RoomInviteCandidate => ({
            userId: member.user_id,
            email: member.email,
          }),
        );
    },
  };
}
