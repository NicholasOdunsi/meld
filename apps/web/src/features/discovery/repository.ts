import type { SupabaseClient } from "@supabase/supabase-js";
import type { Provider } from "@meld/contracts";
import type {
  DecisionInput,
  DiscoveryRoomInput,
  EvidenceInput,
  MessageInput,
  ParticipantInput,
} from "./schemas";
import type { PersistedAttachmentInput } from "./upload-persistence";
import type { DiscoveryAttachmentView } from "./attachment-types";

export type DiscoveryRoom = {
  id: string;
  organizationId: string;
  name: string;
  ownerId: string;
  createdAt: string;
  lastActivityAt: string;
};

// A message is either a human post or a Product Agent reply. The provenance
// lives on the row itself (Task 8's messages columns), so a Product Agent reply
// renders as the Product Agent even when a different participant initiated it,
// and its citations/assumptions/suggested questions travel with the message.
export type DiscoveryMessage = {
  id: string;
  roomId: string;
  clientId: string;
  authorType: "human" | "product_agent";
  authorId: string | null;
  initiatedBy: string | null;
  aiTaskId: string | null;
  provider: Provider | null;
  body: string;
  citedMessageIds: string[];
  citedEvidenceIds: string[];
  assumptions: string[];
  suggestedNextQuestions: string[];
  // Files linked to this message, resolved with a signed viewUrl on the read
  // path. A raw Realtime INSERT never embeds related rows, even though the
  // attachment links commit in the same transaction, so they are resolved by
  // id after delivery.
  attachments: DiscoveryAttachmentView[];
  createdAt: string;
  delivery: "sending" | "persisted" | "failed";
};

// Every column the message mappers read, selected identically for the initial
// query and used to shape the realtime INSERT payload so both carry the full
// provenance.
export const DISCOVERY_MESSAGE_COLUMNS =
  "id,room_id,client_id,author_type,author_id,initiated_by," +
  "ai_task_id,provider,body,cited_message_ids,cited_evidence_ids," +
  "assumptions,suggested_next_questions,created_at";

// A raw message row as it arrives from either PostgREST (initial query) or a
// Realtime `postgres_changes` INSERT. Both deliver the Postgres array columns as
// already-parsed JS arrays; the mapper below only guards against unexpected
// shapes, never re-parses.
export type DiscoveryMessageRow = {
  id: string;
  room_id: string;
  client_id: string;
  author_type?: string | null;
  author_id?: string | null;
  initiated_by?: string | null;
  ai_task_id?: string | null;
  provider?: string | null;
  body: string;
  cited_message_ids?: unknown;
  cited_evidence_ids?: unknown;
  assumptions?: unknown;
  suggested_next_questions?: unknown;
  created_at: string;
};

function toProvider(value: unknown): Provider | null {
  return value === "codex" || value === "claude" ? value : null;
}

// Both the PostgREST query and the Realtime INSERT deliver these columns as
// already-parsed JS arrays, so assumptions and suggested questions survive both
// paths without re-parsing. Anything unexpected safely maps to an empty list.
function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

// The single message mapper shared by the initial Supabase query and the raw
// Realtime INSERT handler. Keeping it one function is what guarantees a Product
// Agent reply carries identical provenance no matter which path delivered it.
export function mapDiscoveryMessageRow(
  row: DiscoveryMessageRow,
): DiscoveryMessage {
  return {
    id: row.id,
    roomId: row.room_id,
    clientId: row.client_id,
    authorType:
      row.author_type === "product_agent" ? "product_agent" : "human",
    authorId: row.author_id ?? null,
    initiatedBy: row.initiated_by ?? null,
    aiTaskId: row.ai_task_id ?? null,
    provider: toProvider(row.provider),
    body: row.body,
    citedMessageIds: toStringArray(row.cited_message_ids),
    citedEvidenceIds: toStringArray(row.cited_evidence_ids),
    assumptions: toStringArray(row.assumptions),
    suggestedNextQuestions: toStringArray(row.suggested_next_questions),
    attachments: [],
    createdAt: row.created_at,
    delivery: "persisted",
  };
}

// A linked attachment row (message_id set) as selected for the read path. The
// signed viewUrl is resolved above the repository, in the backend, since it
// needs the storage handle.
export type DiscoveryLinkedAttachmentRow = {
  id: string;
  message_id: string;
  original_name: string;
  mime_type: string;
  caption: string | null;
  extraction_status: string;
  storage_path: string;
};

export type DiscoveryAttachmentContext = {
  extractionStatus: "pending" | "ready" | "unsupported" | "failed";
  extractedText: string | null;
  caption: string | null;
  storagePath: string;
};

type QueryResult<T> = { data: T | null; error: { message: string } | null };

type DiscoveryRoomRecord = {
  id: string;
  organization_id: string;
  name: string;
  owner_id: string;
  created_at: string;
};

function assertData<T>(
  result: QueryResult<T>,
  fallback: string,
): T {
  if (result.error || !result.data) {
    throw new Error(fallback);
  }
  return result.data;
}

async function requireRepositoryUser(supabase: SupabaseClient) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error("Authentication required");
  }
  return user;
}

export function buildAIContext(
  attachments: DiscoveryAttachmentContext[],
) {
  return attachments.flatMap((attachment) => {
    const entries: string[] = [];
    if (
      attachment.extractionStatus === "ready" &&
      attachment.extractedText
    ) {
      entries.push(attachment.extractedText);
    }
    if (attachment.caption) {
      entries.push(attachment.caption);
    }
    return entries;
  });
}

export function createDiscoveryRepository(supabase: SupabaseClient) {
  return {
    async listRooms(organizationId: string) {
      const result = await supabase
        .from("discovery_rooms")
        .select(
          "id,organization_id,name,owner_id,created_at,messages(created_at)",
        )
        .eq("organization_id", organizationId)
        .order("created_at");
      if (result.error) throw new Error("We could not load rooms.");
      return (result.data ?? []).map((room): DiscoveryRoom => {
        const messageTimes = (
          (room as { messages?: { created_at: string }[] }).messages ??
          []
        ).map((message) => message.created_at);
        return {
          id: room.id,
          organizationId: room.organization_id,
          name: room.name,
          ownerId: room.owner_id,
          createdAt: room.created_at,
          lastActivityAt:
            messageTimes.length > 0
              ? messageTimes.reduce((latest, current) =>
                  current > latest ? current : latest,
                )
              : room.created_at,
        };
      });
    },

    async createRoom(input: DiscoveryRoomInput) {
      await requireRepositoryUser(supabase);
      const result = await supabase.rpc("create_discovery_room", {
        target_organization_id: input.organizationId,
        room_name: input.name,
      });
      const room = assertData(
        result as QueryResult<DiscoveryRoomRecord>,
        "We could not create the room.",
      );
      const created: DiscoveryRoom = {
        id: room.id,
        organizationId: room.organization_id,
        name: room.name,
        ownerId: room.owner_id,
        createdAt: room.created_at,
        lastActivityAt: room.created_at,
      };
      return created;
    },

    async addParticipant(input: ParticipantInput) {
      const result = await supabase
        .from("room_participants")
        .insert({
          room_id: input.roomId,
          user_id: input.userId,
          access: input.access,
        })
        .select("room_id,user_id,access")
        .single();
      return assertData(
        result,
        "We could not add the room participant.",
      );
    },

    async listMessages(roomId: string) {
      const result = await supabase
        .from("messages")
        .select(DISCOVERY_MESSAGE_COLUMNS)
        .eq("room_id", roomId)
        .order("created_at");
      if (result.error) throw new Error("We could not load messages.");
      return (result.data ?? []).map((message) =>
        mapDiscoveryMessageRow(message as unknown as DiscoveryMessageRow),
      );
    },

    // Every attachment already linked to a message in the room. Staged rows
    // (message_id null) are excluded -- they belong to an in-flight compose,
    // not to any rendered message.
    async listRoomLinkedAttachments(
      roomId: string,
    ): Promise<DiscoveryLinkedAttachmentRow[]> {
      const result = await supabase
        .from("attachments")
        .select(
          "id,message_id,original_name,mime_type,caption," +
            "extraction_status,storage_path",
        )
        .eq("room_id", roomId)
        .not("message_id", "is", null)
        .order("created_at");
      if (result.error) {
        throw new Error("We could not load attachments.");
      }
      return (result.data ??
        []) as unknown as DiscoveryLinkedAttachmentRow[];
    },

    // The linked attachments for one message. Used to resolve the files of a
    // message that arrived over Realtime, whose raw row never carries them.
    async listMessageLinkedAttachments(
      roomId: string,
      messageId: string,
    ): Promise<DiscoveryLinkedAttachmentRow[]> {
      const result = await supabase
        .from("attachments")
        .select(
          "id,message_id,original_name,mime_type,caption," +
            "extraction_status,storage_path",
        )
        .eq("room_id", roomId)
        .eq("message_id", messageId)
        .order("created_at");
      if (result.error) {
        throw new Error("We could not load attachments.");
      }
      return (result.data ??
        []) as unknown as DiscoveryLinkedAttachmentRow[];
    },

    async postMessage(input: MessageInput) {
      await requireRepositoryUser(supabase);
      const result = await supabase.rpc("post_discovery_message", {
        target_room_id: input.roomId,
        target_client_id: input.clientId,
        target_body: input.body,
        target_mentioned_user_ids: input.mentionedUserIds,
        target_attachment_ids: input.attachmentIds ?? [],
      });
      const message = assertData(
        {
          data: Array.isArray(result.data) ? result.data[0] : null,
          error: result.error,
        },
        "We could not post the message.",
      ) as unknown as DiscoveryMessageRow;

      return mapDiscoveryMessageRow(message);
    },

    async addEvidence(input: EvidenceInput) {
      const user = await requireRepositoryUser(supabase);
      const result = await supabase
        .from("evidence")
        .insert({
          room_id: input.roomId,
          message_id: input.messageId ?? null,
          attachment_id: input.attachmentId ?? null,
          title: input.title,
          note: input.note ?? null,
          created_by: user.id,
        })
        .select()
        .single();
      return assertData(result, "We could not add evidence.");
    },

    async addDecision(input: DecisionInput) {
      const user = await requireRepositoryUser(supabase);
      const result = await supabase
        .from("decisions")
        .insert({
          room_id: input.roomId,
          source_message_id: input.sourceMessageId ?? null,
          summary: input.summary,
          created_by: user.id,
        })
        .select()
        .single();
      return assertData(result, "We could not add the decision.");
    },

    async createAttachmentIntent(input: PersistedAttachmentInput) {
      const user = await requireRepositoryUser(supabase);
      const result = await supabase
        .from("attachments")
        .insert({
          id: input.id,
          room_id: input.roomId,
          message_id: input.messageId ?? null,
          uploaded_by: user.id,
          storage_path: input.storagePath,
          original_name: input.fileName,
          mime_type: input.mimeType,
          byte_size: input.size,
          caption: input.caption ?? null,
          extraction_status: "pending",
          extracted_text: null,
        })
        .select()
        .single();
      return assertData(result, "We could not save the attachment.");
    },

    async finalizeAttachment(input: PersistedAttachmentInput) {
      const result = await supabase
        .from("attachments")
        .update({
          extraction_status: input.extractionStatus,
          extracted_text: input.extractedText,
        })
        .eq("id", input.id)
        .eq("room_id", input.roomId)
        .select()
        .single();
      return assertData(
        result,
        "We could not finalize the attachment.",
      );
    },

    async markAttachmentFailed(id: string) {
      const user = await requireRepositoryUser(supabase);
      const result = await supabase
        .from("attachments")
        .update({
          extraction_status: "failed",
          extracted_text: null,
        })
        .eq("id", id)
        .eq("uploaded_by", user.id)
        .select()
        .single();
      return assertData(
        result,
        "We could not mark the attachment as failed.",
      );
    },

    async claimStagedAttachmentForDiscard(input: {
      roomId: string;
      attachmentId: string;
    }) {
      const user = await requireRepositoryUser(supabase);
      const result = await supabase
        .from("attachments")
        .update({ discard_pending: true })
        .eq("room_id", input.roomId)
        .eq("id", input.attachmentId)
        .eq("uploaded_by", user.id)
        .is("message_id", null)
        .select("storage_path")
        .maybeSingle();
      if (result.error) {
        throw new Error("We could not discard the staged attachment.");
      }
      return result.data
        ? { storagePath: result.data.storage_path }
        : null;
    },

    async deleteClaimedStagedAttachment(input: {
      roomId: string;
      attachmentId: string;
    }) {
      const user = await requireRepositoryUser(supabase);
      const result = await supabase
        .from("attachments")
        .delete()
        .eq("room_id", input.roomId)
        .eq("id", input.attachmentId)
        .eq("uploaded_by", user.id)
        .is("message_id", null)
        .eq("discard_pending", true);
      if (result.error) {
        throw new Error("We could not discard the staged attachment.");
      }
    },

    async listAttachmentStoragePaths(roomId: string) {
      const result = await supabase
        .from("attachments")
        .select("storage_path")
        .eq("room_id", roomId);
      if (result.error) {
        throw new Error("We could not load the room's attachments.");
      }
      return (result.data ?? []).map(
        (row) => row.storage_path as string,
      );
    },

    async deleteRoom(roomId: string) {
      const user = await requireRepositoryUser(supabase);
      const ownedRoom = await supabase
        .from("discovery_rooms")
        .select("id")
        .eq("id", roomId)
        .eq("owner_id", user.id)
        .maybeSingle();

      // Broadcast before deleting: the receive policy authorizes against
      // live room_participants rows, which the delete's cascade removes.
      // Sending first, while participants still exist, is what lets every
      // other open tab on this room learn about the deletion in real time
      // instead of waiting on a manual refresh. Gated on the ownership
      // check above so a non-owner's rejected delete attempt can't send a
      // false "room-deleted" notification to everyone else in the room.
      if (ownedRoom.data) {
        // The realtime client normally picks up the session token via a
        // fire-and-forget promise kicked off when the client was
        // constructed; explicitly awaiting it here avoids sending this
        // broadcast unauthenticated if that promise hasn't settled yet on
        // this short-lived, per-request server client.
        await supabase.realtime.setAuth();
        await supabase.channel(`room:${roomId}`, {
          config: { private: true },
        }).send({
          type: "broadcast",
          event: "room-deleted",
          payload: {},
        });
      }

      const result = await supabase
        .from("discovery_rooms")
        .delete()
        .eq("id", roomId)
        .select("id");
      if (result.error) {
        throw new Error("We could not delete the room.");
      }
      if (!result.data || result.data.length === 0) {
        throw new Error("Only the room owner can delete this room.");
      }
    },
  };
}
