"use server";

import { revalidatePath } from "next/cache";
import { deriveRoomNameFromFiles } from "@/features/home/upload-seed";
import { extractAttachmentText } from "./attachment-extractor";
import type { DiscoveryAttachmentView } from "./attachment-types";
import {
  getDiscoveryBackend,
  type AttachmentUpload,
  type RoomInviteCandidate,
} from "./backend";
// Note: no `export type { RoomInviteCandidate }` here. Next's "use server"
// transform emits a re-export as a runtime binding, which throws
// ReferenceError at request time even though tsc and the build accept it.
// Consumers import the type from ./backend instead.
import {
  AttachmentInputSchema,
  DecisionInputSchema,
  DeleteRoomInputSchema,
  DiscoveryRoomInputSchema,
  EvidenceInputSchema,
  MessageInputSchema,
  ParticipantInputSchema,
  StagedAttachmentDiscardInputSchema,
  StagedAttachmentLinkInputSchema,
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

// Not exported: this module is "use server", so an export here would
// publish an endpoint. Only the wrappers below need it.
async function createDiscoveryRoom(input: DiscoveryRoomInput) {
  const parsed = DiscoveryRoomInputSchema.parse(input);
  const backend = await getDiscoveryBackend();
  return backend.createRoom(parsed);
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

export async function deleteDiscoveryRoom(input: {
  organizationId: string;
  roomId: string;
}) {
  const parsed = DeleteRoomInputSchema.parse(input);
  const backend = await getDiscoveryBackend();
  await backend.deleteRoom(parsed);
  revalidatePath(`/${parsed.organizationId}`, "layout");
}

export async function addRoomParticipant(input: ParticipantInput) {
  const parsed = ParticipantInputSchema.parse(input);
  const backend = await getDiscoveryBackend();
  return backend.addParticipant(parsed);
}

export async function listDiscoveryMessages(roomId: string) {
  const parsed = MessageInputSchema.shape.roomId.parse(roomId);
  const backend = await getDiscoveryBackend();
  return backend.listMessages(parsed);
}

export async function postMessage(input: MessageInput) {
  const parsed = MessageInputSchema.parse(input);
  if (parsed.mentionsProductAgent) {
    throw new Error("Connect personal AI to use the Product Agent");
  }
  const backend = await getDiscoveryBackend();
  return backend.postMessage(parsed);
}

export async function addEvidence(input: EvidenceInput) {
  const parsed = EvidenceInputSchema.parse(input);
  const backend = await getDiscoveryBackend();
  return backend.addEvidence(parsed);
}

export async function addDecision(input: DecisionInput) {
  const parsed = DecisionInputSchema.parse(input);
  const backend = await getDiscoveryBackend();
  return backend.addDecision(parsed);
}

function parseAttachmentForm(
  formData: FormData,
  staged: boolean,
) {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new Error("Choose an attachment.");
  }
  const roomId = String(formData.get("roomId") ?? "");
  const messageId = staged
    ? undefined
    : String(formData.get("messageId") ?? "") || undefined;
  const submittedCaption =
    String(formData.get("caption") ?? "") || undefined;
  const caption =
    staged && file.type.startsWith("image/")
      ? submittedCaption || file.name
      : submittedCaption;
  const metadata = AttachmentInputSchema.parse({
    roomId,
    messageId,
    caption,
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
  });
  return { file, metadata };
}

// Extraction is the same work whichever store the bytes land in, so it runs
// here and both backends receive the result.
async function readAttachmentUpload(
  formData: FormData,
  staged: boolean,
): Promise<AttachmentUpload> {
  const { file, metadata } = parseAttachmentForm(formData, staged);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const extractedText = await extractAttachmentText({
    mimeType: metadata.mimeType,
    bytes,
    caption: metadata.caption,
  });
  return { metadata, bytes, extractedText };
}

export async function uploadAttachment(formData: FormData) {
  const upload = await readAttachmentUpload(formData, false);
  const backend = await getDiscoveryBackend();
  return backend.uploadAttachment(upload);
}

export async function stageDiscoveryAttachment(
  formData: FormData,
): Promise<DiscoveryAttachmentView> {
  const upload = await readAttachmentUpload(formData, true);
  const backend = await getDiscoveryBackend();
  return backend.stageAttachment(upload);
}

function assertEveryStagedAttachmentLinked(
  requestedIds: string[],
  linkedIds: string[],
) {
  const requested = new Set(requestedIds);
  const linked = new Set(linkedIds);
  if (
    requested.size !== linked.size ||
    [...requested].some((id) => !linked.has(id))
  ) {
    throw new Error("We could not attach every uploaded file.");
  }
  return [...linked];
}

export async function linkStagedDiscoveryAttachments(input: {
  roomId: string;
  messageId: string;
  attachmentIds: string[];
  caption: string;
}): Promise<string[]> {
  const parsed = StagedAttachmentLinkInputSchema.parse(input);
  const backend = await getDiscoveryBackend();
  const linkedIds = await backend.linkStagedAttachments(parsed);
  return assertEveryStagedAttachmentLinked(
    parsed.attachmentIds,
    linkedIds,
  );
}

export async function discardStagedDiscoveryAttachment(input: {
  roomId: string;
  attachmentId: string;
}): Promise<void> {
  const parsed = StagedAttachmentDiscardInputSchema.parse(input);
  const backend = await getDiscoveryBackend();
  await backend.discardStagedAttachment(parsed);
}

export async function createRoomFromUploads(formData: FormData) {
  const organizationId = String(
    formData.get("organizationId") ?? "",
  );
  const files = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File);
  if (files.length === 0) {
    throw new Error("Choose at least one file.");
  }

  const room = await createDiscoveryRoom({
    organizationId,
    name: deriveRoomNameFromFiles(files.map((file) => file.name)),
  });

  // The room exists from here on, so a failing file must not abort the
  // batch or hide the room id. Callers navigate to the room either way
  // and report the names that did not attach; throwing here would strand
  // the user on a room they cannot reach and tempt a duplicate create.
  const failedFileNames: string[] = [];
  for (const file of files) {
    const attachment = new FormData();
    attachment.set("roomId", room.id);
    attachment.set("file", file);
    try {
      await uploadAttachment(attachment);
    } catch {
      // Redacted per the log policy: the file name identifies which
      // upload failed without risking attachment content or a raw
      // storage/DB error message in the logs.
      console.error(`Attachment upload failed for "${file.name}".`);
      failedFileNames.push(file.name);
    }
  }

  return { roomId: room.id, failedFileNames };
}

export async function listRoomInviteCandidates(
  organizationId: string,
): Promise<RoomInviteCandidate[]> {
  const parsed =
    DiscoveryRoomInputSchema.shape.organizationId.parse(organizationId);
  const backend = await getDiscoveryBackend();
  return backend.listInviteCandidates(parsed);
}

export async function createRoomWithParticipants(input: {
  organizationId: string;
  name: string;
  participantUserIds: string[];
}) {
  const parsed = DiscoveryRoomInputSchema.parse({
    organizationId: input.organizationId,
    name: input.name,
  });
  // Duplicates would collide on room_participants' (room_id, user_id)
  // primary key and report as spurious failures.
  const participantUserIds = [...new Set(input.participantUserIds)];

  // One backend for the whole batch. Resolving it once is what keeps this
  // to a single session verification: going through the createDiscoveryRoom
  // and addRoomParticipant actions instead would re-authenticate on every
  // write, and each of those is a round trip to the Auth server (~10ms
  // locally, 100-400ms against hosted Supabase).
  const backend = await getDiscoveryBackend();
  const room = await backend.createRoom(parsed);

  // The room exists from here on, matching createRoomFromUploads: a
  // failing invite must not abort the batch or hide the room id. Invites
  // also run concurrently rather than one at a time, so wall-clock time
  // no longer scales with the number of people invited.
  const results = await Promise.allSettled(
    participantUserIds.map((userId) =>
      backend.addParticipant({
        roomId: room.id,
        userId,
        access: "edit",
      }),
    ),
  );

  const failedUserIds: string[] = [];
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      const userId = participantUserIds[index];
      // Redacted per the log policy: the user id identifies which
      // invite failed without risking a raw DB/RLS error message.
      console.error(`Room participant invite failed for "${userId}".`);
      failedUserIds.push(userId);
    }
  });

  // The sidebar's room list lives in the organization layout, which a
  // client-side push to a nested route would otherwise reuse from cache.
  // Revalidating here lets the caller navigate with a single push instead
  // of following it with a full router.refresh() of the whole tree.
  revalidatePath(`/${parsed.organizationId}`, "layout");

  return { roomId: room.id, failedUserIds };
}
