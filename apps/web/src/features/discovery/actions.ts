"use server";

import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { extractAttachmentText } from "./attachment-extractor";
import { isDiscoveryFakeEnabled } from "./e2e-gate";
import { createDiscoveryRepository } from "./repository";
import { persistAttachmentUpload } from "./upload-persistence";
import {
  AttachmentInputSchema,
  DecisionInputSchema,
  DiscoveryRoomInputSchema,
  EvidenceInputSchema,
  MessageInputSchema,
  ParticipantInputSchema,
  type DecisionInput,
  type DiscoveryRoomInput,
  type EvidenceInput,
  type MessageInput,
  type ParticipantInput,
} from "./schemas";

export type DiscoveryFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  roomId?: string;
  fieldErrors?: { name?: string };
};

async function getAuthenticatedRepository() {
  const supabase = await createClient(new Headers());
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Authentication required");
  return {
    supabase,
    user,
    repository: createDiscoveryRepository(supabase),
  };
}

export async function listDiscoveryRooms(organizationId: string) {
  const parsed = DiscoveryRoomInputSchema.shape.organizationId.parse(
    organizationId,
  );
  if (isDiscoveryFakeEnabled()) {
    const { fakeListRooms } = await import("./e2e-fake");
    return fakeListRooms(parsed);
  }
  const { repository } = await getAuthenticatedRepository();
  return repository.listRooms(parsed);
}

export async function createDiscoveryRoom(input: DiscoveryRoomInput) {
  const parsed = DiscoveryRoomInputSchema.parse(input);
  if (isDiscoveryFakeEnabled()) {
    const { fakeCreateRoom } = await import("./e2e-fake");
    return fakeCreateRoom(parsed);
  }
  const { repository } = await getAuthenticatedRepository();
  return repository.createRoom(parsed);
}

export async function createDiscoveryRoomFromForm(
  _previousState: DiscoveryFormState,
  formData: FormData,
): Promise<DiscoveryFormState> {
  const parsed = DiscoveryRoomInputSchema.safeParse({
    organizationId: formData.get("organizationId"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Enter a room name.",
      fieldErrors: {
        name: parsed.error.flatten().fieldErrors.name?.[0],
      },
    };
  }
  try {
    const room = await createDiscoveryRoom(parsed.data);
    return { status: "success", roomId: room.id };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "We could not create the room.",
    };
  }
}

export async function addRoomParticipant(input: ParticipantInput) {
  const parsed = ParticipantInputSchema.parse(input);
  if (isDiscoveryFakeEnabled()) {
    const { fakeAddParticipant } = await import("./e2e-fake");
    return fakeAddParticipant(parsed);
  }
  const { repository } = await getAuthenticatedRepository();
  return repository.addParticipant(parsed);
}

export async function listDiscoveryMessages(roomId: string) {
  const parsed = MessageInputSchema.shape.roomId.parse(roomId);
  if (isDiscoveryFakeEnabled()) {
    const { fakeListMessages } = await import("./e2e-fake");
    return fakeListMessages(parsed);
  }
  const { repository } = await getAuthenticatedRepository();
  return repository.listMessages(parsed);
}

export async function postMessage(input: MessageInput) {
  const parsed = MessageInputSchema.parse(input);
  if (parsed.mentionsProductAgent) {
    throw new Error("Connect personal AI to use the Product Agent");
  }
  if (isDiscoveryFakeEnabled()) {
    const { fakePostMessage } = await import("./e2e-fake");
    return fakePostMessage(parsed);
  }
  const { repository } = await getAuthenticatedRepository();
  return repository.postMessage(parsed);
}

export async function addEvidence(input: EvidenceInput) {
  const parsed = EvidenceInputSchema.parse(input);
  if (isDiscoveryFakeEnabled()) {
    const { fakeAddEvidence } = await import("./e2e-fake");
    return fakeAddEvidence(parsed);
  }
  const { repository } = await getAuthenticatedRepository();
  return repository.addEvidence(parsed);
}

export async function addDecision(input: DecisionInput) {
  const parsed = DecisionInputSchema.parse(input);
  if (isDiscoveryFakeEnabled()) {
    const { fakeAddDecision } = await import("./e2e-fake");
    return fakeAddDecision(parsed);
  }
  const { repository } = await getAuthenticatedRepository();
  return repository.addDecision(parsed);
}

export async function getFakeDiscoveryRoom(roomId: string) {
  if (!isDiscoveryFakeEnabled()) return null;
  const { fakeGetRoom } = await import("./e2e-fake");
  return fakeGetRoom(MessageInputSchema.shape.roomId.parse(roomId));
}

export async function getDiscoveryRoomPageData(input: {
  organizationId: string;
  roomId: string;
}) {
  const organizationId =
    DiscoveryRoomInputSchema.shape.organizationId.parse(
      input.organizationId,
    );
  const roomId = MessageInputSchema.shape.roomId.parse(input.roomId);
  if (isDiscoveryFakeEnabled()) {
    const { fakeGetRoom } = await import("./e2e-fake");
    try {
      return await fakeGetRoom(roomId);
    } catch {
      return null;
    }
  }

  const { supabase, user, repository } =
    await getAuthenticatedRepository();
  const roomResult = await supabase
    .from("discovery_rooms")
    .select("id,organization_id,name,owner_id,created_at")
    .eq("id", roomId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (roomResult.error || !roomResult.data) return null;

  const [
    messages,
    participantsResult,
    membersResult,
    evidenceResult,
    decisionsResult,
    attachmentsResult,
  ] = await Promise.all([
      repository.listMessages(roomId),
      supabase
        .from("room_participants")
        .select("room_id,user_id,access")
        .eq("room_id", roomId),
      supabase.rpc("list_organization_members", {
        target_organization_id: organizationId,
      }),
      supabase
        .from("evidence")
        .select("id,room_id,title,note,created_at")
        .eq("room_id", roomId)
        .order("created_at"),
      supabase
        .from("decisions")
        .select("id,room_id,summary,created_at")
        .eq("room_id", roomId)
        .order("created_at"),
      supabase
        .from("attachments")
        .select(
          "id,room_id,original_name,mime_type,caption,extraction_status,storage_path",
        )
        .eq("room_id", roomId)
        .order("created_at"),
    ]);
  if (
    participantsResult.error ||
    membersResult.error ||
    evidenceResult.error ||
    decisionsResult.error ||
    attachmentsResult.error
  ) {
    throw new Error("We could not load the Discovery Room.");
  }
  const members = (membersResult.data ?? []) as Array<{
    user_id: string;
    email: string;
    role: "admin" | "member";
    created_at: string;
  }>;
  const attachments = await Promise.all(
    (attachmentsResult.data ?? []).map(async (attachment) => {
      const signed = await supabase.storage
        .from("discovery-attachments")
        .createSignedUrl(attachment.storage_path, 60 * 60);
      return {
        id: attachment.id,
        originalName: attachment.original_name,
        mimeType: attachment.mime_type,
        caption: attachment.caption,
        extractionStatus: attachment.extraction_status,
        viewUrl: signed.data?.signedUrl ?? null,
      };
    }),
  );
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
    messages,
    members,
    participants: (participantsResult.data ?? []).map((participant) => ({
      roomId: participant.room_id,
      userId: participant.user_id,
      access: participant.access as "view" | "edit",
      email:
        members.find((member) => member.user_id === participant.user_id)
          ?.email ?? "Room participant",
    })),
    evidence: evidenceResult.data ?? [],
    decisions: decisionsResult.data ?? [],
    attachments,
  };
}

export async function uploadAttachment(formData: FormData) {
  if (isDiscoveryFakeEnabled()) {
    throw new Error(
      "Attachment persistence requires local Supabase in this test mode.",
    );
  }
  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new Error("Choose an attachment.");
  }
  const roomId = String(formData.get("roomId") ?? "");
  const messageId = String(formData.get("messageId") ?? "") || undefined;
  const caption = String(formData.get("caption") ?? "") || undefined;
  const metadata = AttachmentInputSchema.parse({
    roomId,
    messageId,
    caption,
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
  });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const extractedText = await extractAttachmentText({
    mimeType: metadata.mimeType,
    bytes,
    caption: metadata.caption,
  });
  const id = randomUUID();
  const safeName = metadata.fileName
    .normalize("NFKC")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .slice(0, 120);
  const storagePath = `${metadata.roomId}/${id}/${safeName}`;
  const { supabase, repository } = await getAuthenticatedRepository();
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
    storage: supabase.storage.from("discovery-attachments"),
  });
  return {
    id: saved.id as string,
    originalName: saved.original_name as string,
    extractionStatus: saved.extraction_status as string,
  };
}
