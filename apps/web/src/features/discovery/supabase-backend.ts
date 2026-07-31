import "server-only";

import { randomUUID } from "node:crypto";
import { listRoomAiTaskStatuses } from "@/features/ai/room-task-status";
import type { DiscoveryAttachmentView } from "./attachment-types";
import type {
  AttachmentUpload,
  DiscoveryBackend,
  RoomInviteCandidate,
} from "./backend";
import { getAuthenticatedRepository } from "./session";
import { persistAttachmentUpload } from "./upload-persistence";

const ATTACHMENT_BUCKET = "discovery-attachments";

const SIGNED_URL_TTL_SECONDS = 60 * 60;

export async function createSupabaseDiscoveryBackend(): Promise<DiscoveryBackend> {
  // Authenticated once per request here rather than per operation, so a
  // caller that writes a room and then invites several people pays for one
  // session verification instead of one per write.
  const { supabase, user, repository } =
    await getAuthenticatedRepository();

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
    const view: DiscoveryAttachmentView = {
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

  return {
    listRooms(organizationId) {
      return repository.listRooms(organizationId);
    },

    async getRoomPageData(input) {
      const roomResult = await supabase
        .from("discovery_rooms")
        .select("id,organization_id,name,owner_id,created_at")
        .eq("id", input.roomId)
        .eq("organization_id", input.organizationId)
        .maybeSingle();
      if (roomResult.error || !roomResult.data) return null;

      const [
        messages,
        participantsResult,
        membersResult,
      ] = await Promise.all([
        repository.listMessages(input.roomId),
        supabase
          .from("room_participants")
          .select("room_id,user_id,access")
          .eq("room_id", input.roomId),
        supabase.rpc("list_organization_members", {
          target_organization_id: input.organizationId,
        }),
      ]);
      if (participantsResult.error || membersResult.error) {
        throw new Error("We could not load the Discovery Room.");
      }
      const members = (membersResult.data ?? []) as Array<{
        user_id: string;
        email: string;
      }>;
      return {
        room: {
          id: roomResult.data.id,
          organizationId: roomResult.data.organization_id,
          name: roomResult.data.name,
          ownerId: roomResult.data.owner_id,
          createdAt: roomResult.data.created_at,
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
          (participant) => ({
            roomId: participant.room_id,
            userId: participant.user_id,
            access: participant.access as "view" | "edit",
            email:
              members.find(
                (member) => member.user_id === participant.user_id,
              )?.email ?? "Room participant",
          }),
        ),
        messages,
        realtimeMode: "production" as const,
      };
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

    listMessages(roomId) {
      return repository.listMessages(roomId);
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
      const signed = await attachmentStorage().createSignedUrl(
        storagePath,
        SIGNED_URL_TTL_SECONDS,
      );
      return { ...view, viewUrl: signed.data?.signedUrl ?? null };
    },

    async linkStagedAttachments(input) {
      const result = await supabase.rpc(
        "link_staged_discovery_attachments",
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

    async listInviteCandidates(organizationId) {
      const result = await supabase.rpc("list_organization_members", {
        target_organization_id: organizationId,
      });
      if (result.error) {
        throw new Error("We could not load organization members.");
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
