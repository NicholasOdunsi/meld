"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  resolveAgentReadiness,
  type AgentReadiness,
} from "@/features/ai/agent-readiness";
import { cancelRoomReplyTask as cancelRoomReplyTaskService } from "@/features/ai/cancel-room-reply-task";
import { createRoomReplyTask } from "@/features/ai/create-room-reply-task";
import type { RoomTaskStatus } from "@/features/ai/room-task-status";
import { isDeviceFakeEnabled } from "@/features/ai/e2e-gate";
import { createClient } from "@/lib/supabase/server";
import { deriveRoomNameFromFiles } from "@/features/home/upload-seed";
import { buildBriefOpener } from "./brief-opener";
import { isRoomFakeEnabled } from "./e2e-gate";
import type { RoomMessage } from "./repository";
import { extractAttachmentText } from "./attachment-extractor";
import { resolveMimeType } from "./attachment-mime";
import { withTimeout } from "./with-timeout";
import type { RoomAttachmentView } from "./attachment-types";
import {
  getRoomBackend,
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
  RoomInputSchema,
  EvidenceInputSchema,
  MessageInputSchema,
  ParticipantInputSchema,
  RemoveParticipantInputSchema,
  RoomParticipantSelectionSchema,
  StagedAttachmentDiscardInputSchema,
  StagedAttachmentLinkInputSchema,
  type DecisionInput,
  type RoomInput,
  type EvidenceInput,
  type MessageInput,
  type ParticipantInput,
  type RoomParticipantSelection,
} from "./schemas";

const ATTACHMENT_WORK_TIMEOUT_MS = 30_000;

// Mirrors MessageInputSchema.attachmentIds's .max(10): postMessage's Zod
// parse throws for an 11th id, so a brief with more files than this must
// never reach postMessage with all of them staged.
const MAX_BRIEF_ATTACHMENTS = 10;

export type RoomFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  roomId?: string;
  fieldErrors?: { name?: string };
};

// Not exported: this module is "use server", so an export here would
// publish an endpoint. Only the wrappers below need it.
async function createRoom(input: RoomInput) {
  const parsed = RoomInputSchema.parse(input);
  const backend = await getRoomBackend();
  return backend.createRoom(parsed);
}

export async function createRoomFromForm(
  _previousState: RoomFormState,
  formData: FormData,
): Promise<RoomFormState> {
  const parsed = RoomInputSchema.safeParse({
    workspaceId: formData.get("workspaceId"),
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
    const room = await createRoom(parsed.data);
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

export async function deleteRoom(input: {
  workspaceId: string;
  roomId: string;
}) {
  const parsed = DeleteRoomInputSchema.parse(input);
  const backend = await getRoomBackend();
  await backend.deleteRoom(parsed);
  revalidatePath(`/${parsed.workspaceId}`, "layout");
}

export async function addRoomParticipant(input: ParticipantInput) {
  const parsed = ParticipantInputSchema.parse(input);
  const backend = await getRoomBackend();
  return backend.addParticipant(parsed);
}

export async function removeRoomParticipant(input: {
  roomId: string;
  userId: string;
}) {
  const parsed = RemoveParticipantInputSchema.parse(input);
  const backend = await getRoomBackend();
  await backend.removeParticipant(parsed);
}

export async function listRoomMessages(roomId: string) {
  const parsed = MessageInputSchema.shape.roomId.parse(roomId);
  const backend = await getRoomBackend();
  return backend.listMessages(parsed);
}

// The linked attachments for a single message, with freshly signed view URLs.
// A message that arrives over Realtime carries no attachments (they link after
// the insert), so the conversation calls this to resolve them for a teammate's
// message the moment it appears, instead of waiting for the next full load.
export async function listRoomMessageAttachments(
  roomId: string,
  messageId: string,
): Promise<RoomAttachmentView[]> {
  const parsedRoomId = MessageInputSchema.shape.roomId.parse(roomId);
  const parsedMessageId = MessageInputSchema.shape.roomId.parse(messageId);
  const backend = await getRoomBackend();
  return backend.listMessageAttachments(parsedRoomId, parsedMessageId);
}

// The browser's ONLY window onto AI task status: the safe, participant-scoped
// list_room_ai_task_statuses projection, never a direct ai_tasks read. Drives
// the every-two-seconds pending-state poll in the conversation.
export async function listRoomTaskStatuses(
  roomId: string,
): Promise<RoomTaskStatus[]> {
  const parsed = MessageInputSchema.shape.roomId.parse(roomId);
  const backend = await getRoomBackend();
  return backend.listRoomTaskStatuses(parsed);
}

// Cancel recovery for a pending Product Agent reply. Ownership is enforced by
// cancel_ai_task itself; this action only authenticates and forwards.
export async function cancelRoomReplyTask(taskId: string) {
  const parsed = MessageInputSchema.shape.roomId.parse(taskId);
  return cancelRoomReplyTaskService(parsed);
}

// The human post and, when the message mentions the Product Agent, the AI
// reply task it triggers. The two are reported separately because the human
// message is the durable record and the task is best-effort: the message
// having persisted is never contingent on the task being created.
export type PostMessageResult = {
  message: RoomMessage;
  agentTask:
    | { status: "queued"; taskId: string }
    | { status: "not_requested" }
    | { status: "retryable_error"; message: string };
};

const ROOM_REPLY_RETRY_ERROR =
  "We could not ask the agent to reply. Please try again.";

export async function postMessage(
  input: MessageInput,
): Promise<PostMessageResult> {
  const parsed = MessageInputSchema.parse(input);
  // A message must carry something: text, or at least one attachment to share.
  if (
    parsed.body.length === 0 &&
    (parsed.attachmentIds?.length ?? 0) === 0
  ) {
    throw new Error("Add a message or an attachment before sending.");
  }
  const backend = await getRoomBackend();

  // GLOBAL CONSTRAINT: the human message, mentions, and staged attachment
  // links persist atomically before any task is created. Everything after this
  // line is best-effort task creation; none of it may roll back, delete, or
  // fail the committed post.
  const message = await backend.postMessage(parsed);

  const agentKind =
    parsed.agentKind ?? (parsed.mentionsProductAgent ? "product" : undefined);
  if (!agentKind) {
    return { message, agentTask: { status: "not_requested" } };
  }
  const researchScope =
    agentKind === "research" ? (parsed.researchScope ?? "room") : "room";

  // Only a semantic @Product Agent mention reaches here. The task is bound to
  // the message that just persisted, so its id is the source-message id.
  try {
    // In E2E fake mode the human message persisted through the in-memory store,
    // so the reply task is queued through that same store rather than the real
    // create_room_reply_task RPC (which has no fake Supabase behind it).
    const task = isRoomFakeEnabled()
      ? await (await import("./e2e-fake")).fakeCreateRoomReplyTask({
          roomId: parsed.roomId,
          sourceMessageId: message.id,
          provider: parsed.providerOverride,
          model: parsed.modelOverride,
          ...(agentKind === "research"
            ? { agentKind, researchScope }
            : {}),
        })
      : await createRoomReplyTask({
          sourceMessageId: message.id,
          provider: parsed.providerOverride,
          model: parsed.modelOverride,
          ...(agentKind === "research"
            ? { agentKind, researchScope }
            : {}),
        });
    return {
      message,
      agentTask: { status: "queued", taskId: task.id },
    };
  } catch (error) {
    // The message is already durable; report a retryable failure rather than
    // undoing it. A readiness race (the provider disappearing between the
    // preflight and this call) lands here and is offered as a retry.
    return {
      message,
      agentTask: {
        status: "retryable_error",
        message:
          error instanceof Error && error.message
            ? error.message
            : ROOM_REPLY_RETRY_ERROR,
      },
    };
  }
}

// Readiness preflight for the composer: resolves, from the authenticated
// session, whether a Product Agent mention can be queued now and which
// providers a per-task picker may offer. Never inferred from client state.
export async function getAgentReadiness(): Promise<AgentReadiness> {
  // The composer preflight has no fake Supabase to resolve devices and
  // preferences from in E2E mode, so it reads the same fake device the rest of
  // the AI onboarding path uses.
  if (isDeviceFakeEnabled()) {
    // A spec may seed a not-ready state to prove the draft-preserving setup
    // redirect, which is a web-only UX path.
    const { cookies } = await import("next/headers");
    if ((await cookies()).get("meld-e2e-agent-not-ready")) {
      return { ready: false, reason: "no_device" };
    }
    const fake = await import("@/features/ai/e2e-fake");
    return fake.fakeAgentReadiness();
  }
  const supabase = await createClient(new Headers());
  return resolveAgentReadiness(supabase);
}

export async function addEvidence(input: EvidenceInput) {
  const parsed = EvidenceInputSchema.parse(input);
  const backend = await getRoomBackend();
  return backend.addEvidence(parsed);
}

export async function addDecision(input: DecisionInput) {
  const parsed = DecisionInputSchema.parse(input);
  const backend = await getRoomBackend();
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
  const mimeType = resolveMimeType(file.name, file.type);
  const caption =
    staged && mimeType.startsWith("image/")
      ? submittedCaption || file.name
      : submittedCaption;
  const metadata = AttachmentInputSchema.parse({
    roomId,
    messageId,
    caption,
    fileName: file.name,
    mimeType,
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
  const extractedText = await withTimeout(
    () =>
      extractAttachmentText({
        mimeType: metadata.mimeType,
        bytes,
        caption: metadata.caption,
      }),
    ATTACHMENT_WORK_TIMEOUT_MS,
    "Reading this file took too long.",
  );
  return { metadata, bytes, extractedText };
}

export async function uploadAttachment(formData: FormData) {
  const upload = await readAttachmentUpload(formData, false);
  const backend = await getRoomBackend();
  return backend.uploadAttachment(upload);
}

export async function stageRoomAttachment(
  formData: FormData,
): Promise<RoomAttachmentView> {
  const upload = await readAttachmentUpload(formData, true);
  const backend = await getRoomBackend();
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

export async function linkStagedRoomAttachments(input: {
  roomId: string;
  messageId: string;
  attachmentIds: string[];
  caption: string;
}): Promise<string[]> {
  const parsed = StagedAttachmentLinkInputSchema.parse(input);
  const backend = await getRoomBackend();
  const linkedIds = await backend.linkStagedAttachments(parsed);
  return assertEveryStagedAttachmentLinked(
    parsed.attachmentIds,
    linkedIds,
  );
}

export async function discardStagedRoomAttachment(input: {
  roomId: string;
  attachmentId: string;
}): Promise<void> {
  const parsed = StagedAttachmentDiscardInputSchema.parse(input);
  const backend = await getRoomBackend();
  await backend.discardStagedAttachment(parsed);
}

export type CreateRoomFromBriefResult =
  | { ready: true; roomId: string; failedFileNames: string[] }
  | {
      ready: false;
      roomId: string;
      stagedAttachmentIds: string[];
      failedFileNames: string[];
    };

// Import-a-brief entry point: stage every file, then either hand the room
// straight to the caller (agent not ready, or nothing staged) or post an
// @Product Agent opener with the staged brief linked so the reply task's
// frozen manifest can read it.
export async function createRoomFromBrief(
  formData: FormData,
): Promise<CreateRoomFromBriefResult> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const files = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File);
  if (files.length === 0) {
    throw new Error("Choose at least one file.");
  }

  const room = await createRoom({
    workspaceId,
    name: deriveRoomNameFromFiles(files.map((file) => file.name)),
  });

  // The sidebar's room list lives in the workspace layout, which a
  // client-side push to a nested route would otherwise reuse from cache.
  // Revalidating here lets the caller navigate with a single push and have the
  // imported room appear immediately, instead of needing a manual refresh.
  // Matches createRoomWithParticipants and deleteRoom.
  revalidatePath(`/${workspaceId}`, "layout");

  const backend = await getRoomBackend();
  const stagedAttachmentIds: string[] = [];
  // Files beyond MAX_BRIEF_ATTACHMENTS never reach staging at all: they are
  // reported as unattached up front, which keeps stagedAttachmentIds.length
  // <= 10 no matter how many files were dropped in.
  const filesToStage = files.slice(0, MAX_BRIEF_ATTACHMENTS);
  const failedFileNames: string[] = files
    .slice(MAX_BRIEF_ATTACHMENTS)
    .map((file) => file.name);
  for (const file of filesToStage) {
    const staged = new FormData();
    staged.set("roomId", room.id);
    staged.set("file", file);
    try {
      const upload = await readAttachmentUpload(staged, true);
      const view = await backend.stageAttachment(upload);
      stagedAttachmentIds.push(view.id);
    } catch (error) {
      // Log the failure reason (a storage/DB/extraction error message, never
      // attachment content) so a brief that does not stage can be diagnosed
      // instead of silently dropped.
      console.error(
        `Brief staging failed for "${file.name}":`,
        error instanceof Error ? error.message : error,
      );
      failedFileNames.push(file.name);
    }
  }

  // The room and every staged attachment already exist by this point,
  // matching the "room creation and staging are never rolled back" rule
  // below: readiness and the ready-branch postMessage are the only steps
  // wrapped, since a throw from either (e.g. a readiness resolution failure)
  // must not orphan the room. Any throw here downgrades to the same
  // not-ready shape as "no ready agent", so the caller always reaches the
  // room and the client can save a restorable draft.
  try {
    const readiness = await getAgentReadiness();

    // No brief made it through, or no agent to review it: hand back a room
    // the caller can open. The not-ready branch also covers "nothing
    // staged".
    if (readiness.ready !== true || stagedAttachmentIds.length === 0) {
      return {
        ready: false,
        roomId: room.id,
        stagedAttachmentIds,
        failedFileNames,
      };
    }

    await postMessage({
      roomId: room.id,
      clientId: randomUUID(),
      body: buildBriefOpener(stagedAttachmentIds.length),
      mentionedUserIds: [],
      mentionsProductAgent: true,
      attachmentIds: stagedAttachmentIds,
    });

    return { ready: true, roomId: room.id, failedFileNames };
  } catch {
    return {
      ready: false,
      roomId: room.id,
      stagedAttachmentIds,
      failedFileNames,
    };
  }
}

export async function listRoomInviteCandidates(
  workspaceId: string,
): Promise<RoomInviteCandidate[]> {
  const parsed =
    RoomInputSchema.shape.workspaceId.parse(workspaceId);
  const backend = await getRoomBackend();
  return backend.listInviteCandidates(parsed);
}

export async function createRoomWithParticipants(input: {
  workspaceId: string;
  name: string;
  participants: RoomParticipantSelection[];
}) {
  const parsed = RoomInputSchema.parse({
    workspaceId: input.workspaceId,
    name: input.name,
  });
  // Duplicates would collide on room_participants' (room_id, user_id)
  // primary key and report as spurious failures.
  const participants = Array.from(
    new Map(
      input.participants.map((participant) => {
        const parsedParticipant =
          RoomParticipantSelectionSchema.parse(participant);
        return [parsedParticipant.userId, parsedParticipant];
      }),
    ).values(),
  );

  // One backend for the whole batch. Resolving it once is what keeps this
  // to a single session verification: going through the createRoom
  // and addRoomParticipant actions instead would re-authenticate on every
  // write, and each of those is a round trip to the Auth server (~10ms
  // locally, 100-400ms against hosted Supabase).
  const backend = await getRoomBackend();
  const room = await backend.createRoom(parsed);

  // The room exists from here on, matching createRoomFromBrief: a
  // failing invite must not abort the batch or hide the room id. Invites
  // also run concurrently rather than one at a time, so wall-clock time
  // no longer scales with the number of people invited.
  const results = await Promise.allSettled(
    participants.map((participant) =>
      backend.addParticipant({
        roomId: room.id,
        ...participant,
      }),
    ),
  );

  const failedUserIds: string[] = [];
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      const userId = participants[index].userId;
      // Redacted per the log policy: the user id identifies which
      // invite failed without risking a raw DB/RLS error message.
      console.error(`Room participant invite failed for "${userId}".`);
      failedUserIds.push(userId);
    }
  });

  // The sidebar's room list lives in the workspace layout, which a
  // client-side push to a nested route would otherwise reuse from cache.
  // Revalidating here lets the caller navigate with a single push instead
  // of following it with a full router.refresh() of the whole tree.
  revalidatePath(`/${parsed.workspaceId}`, "layout");

  return { roomId: room.id, failedUserIds };
}
