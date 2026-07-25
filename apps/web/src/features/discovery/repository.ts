import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DecisionInput,
  DiscoveryRoomInput,
  EvidenceInput,
  MessageInput,
  ParticipantInput,
} from "./schemas";
import type { PersistedAttachmentInput } from "./upload-persistence";

export type DiscoveryRoom = {
  id: string;
  organizationId: string;
  name: string;
  ownerId: string;
  createdAt: string;
};

export type DiscoveryMessage = {
  id: string;
  roomId: string;
  clientId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  delivery: "sending" | "persisted" | "failed";
};

export type DiscoveryAttachmentContext = {
  extractionStatus: "pending" | "ready" | "unsupported" | "failed";
  extractedText: string | null;
  caption: string | null;
  storagePath: string;
};

type QueryResult<T> = { data: T | null; error: { message: string } | null };

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
        .select("id,organization_id,name,owner_id,created_at")
        .eq("organization_id", organizationId)
        .order("created_at");
      if (result.error) throw new Error("We could not load rooms.");
      return (result.data ?? []).map((room) => ({
        id: room.id,
        organizationId: room.organization_id,
        name: room.name,
        ownerId: room.owner_id,
        createdAt: room.created_at,
      })) as DiscoveryRoom[];
    },

    async createRoom(input: DiscoveryRoomInput) {
      const user = await requireRepositoryUser(supabase);
      const result = await supabase
        .from("discovery_rooms")
        .insert({
          organization_id: input.organizationId,
          name: input.name,
          owner_id: user.id,
        })
        .select("id,organization_id,name,owner_id,created_at")
        .single();
      const room = assertData(result, "We could not create the room.");
      return {
        id: room.id,
        organizationId: room.organization_id,
        name: room.name,
        ownerId: room.owner_id,
        createdAt: room.created_at,
      } as DiscoveryRoom;
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
        .select("id,room_id,client_id,author_id,body,created_at")
        .eq("room_id", roomId)
        .order("created_at");
      if (result.error) throw new Error("We could not load messages.");
      return (result.data ?? []).map((message) => ({
        id: message.id,
        roomId: message.room_id,
        clientId: message.client_id,
        authorId: message.author_id,
        authorName: "Room participant",
        body: message.body,
        createdAt: message.created_at,
        delivery: "persisted",
      })) as DiscoveryMessage[];
    },

    async postMessage(input: MessageInput) {
      const user = await requireRepositoryUser(supabase);
      const inserted = await supabase
        .from("messages")
        .insert({
          room_id: input.roomId,
          client_id: input.clientId,
          author_id: user.id,
          body: input.body,
        })
        .select("id,room_id,client_id,author_id,body,created_at")
        .single();
      const existing =
        inserted.error &&
        "code" in inserted.error &&
        inserted.error.code === "23505"
          ? await supabase
              .from("messages")
              .select(
                "id,room_id,client_id,author_id,body,created_at",
              )
              .eq("room_id", input.roomId)
              .eq("client_id", input.clientId)
              .single()
          : inserted;
      const message = assertData(
        existing,
        "We could not post the message.",
      );

      if (input.mentionedUserIds.length > 0) {
        const mentions = input.mentionedUserIds.map((userId) => ({
          room_id: input.roomId,
          message_id: message.id,
          mentioned_user_id: userId,
          created_by: user.id,
        }));
        const mentionResult = await supabase
          .from("mentions")
          .upsert(mentions, {
            onConflict: "message_id,mentioned_user_id",
          });
        if (mentionResult.error) {
          throw new Error("The message was posted, but mentions failed.");
        }
      }

      return {
        id: message.id,
        roomId: message.room_id,
        clientId: message.client_id,
        authorId: message.author_id,
        authorName: "You",
        body: message.body,
        createdAt: message.created_at,
        delivery: "persisted",
      } as DiscoveryMessage;
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
  };
}
