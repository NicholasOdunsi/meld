"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isRoomFakeEnabled } from "./e2e-gate";

// Answering a Product Agent proposal. Every write goes through one narrow
// database function: the caller's own response is recorded there, and the
// artifact the proposal describes is created exactly once for the Room no
// matter how many participants confirm it or how often they retry.

const MessageIdSchema = z.string().uuid();
const RoomIdSchema = z.string().uuid();
const ProposalResponseSchema = z.enum(["accepted", "dismissed"]);

const DecisionRowSchema = z
  .object({
    id: z.string().uuid(),
    summary: z.string(),
  })
  .passthrough();

const AcceptedUserFlowSchema = z
  .object({
    user_flow: z.object({ room_id: z.string().uuid() }).passthrough(),
    task: z.object({ id: z.string().uuid() }).passthrough(),
  })
  .passthrough();

const ProposalResponseRowSchema = z.object({
  message_id: z.string().uuid(),
  response: ProposalResponseSchema,
});

export type ProposalResponse = "accepted" | "dismissed";

export type CapturedDecision = {
  id: string;
  summary: string;
};

export type AcceptedUserFlow = {
  roomId: string;
  taskId: string;
};

const DISMISS_ERROR = "We could not dismiss that suggestion.";
const ACCEPT_PRD_ERROR = "We could not accept that PRD update.";
const CAPTURE_ERROR = "We could not capture that decision.";
const ACCEPT_ERROR = "We could not create that user flow.";
// `accept_proposed_user_flow` delegates to
// `create_user_flow_generate_task_internal`, which raises
// `invalid_user_flow_generate_request` when the caller has no active execution
// device with an authenticated, supported provider connection. Any participant
// with edit access can confirm a proposal the Product Agent made for someone
// else, so a participant who has never paired a device reaches this routinely.
// The transaction rolls back cleanly; only the message was wrong.
const AGENT_DEVICE_ERROR =
  "Connect an agent device before creating a user flow. " +
  "Open Settings -> AI connections to pair one.";

function firstRow(data: unknown): unknown {
  return Array.isArray(data) ? data[0] : data;
}

// Every failure in this seam collapses into one stable user-facing string, so
// the reason has to be logged or a permanently broken RPC produces no
// server-side signal at all. Redacted the same way the rest of the room
// actions redact: the operation and the reason, never row content.
function logProposalFailure(operation: string, reason: unknown): void {
  console.error(
    `Room proposal ${operation} failed:`,
    reason instanceof Error ? reason.message : reason,
  );
}

// The Supabase client surfaces a PostgREST error object rather than throwing,
// so the raised condition is readable on `message`/`code` before it is
// flattened into user-facing copy.
function isMissingAgentDevice(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const message = (error as { message?: unknown }).message;
  return (
    typeof message === "string" &&
    message.includes("invalid_user_flow_generate_request")
  );
}

export async function dismissMessageProposal(
  messageId: string,
): Promise<ProposalResponse> {
  const parsedMessageId = MessageIdSchema.parse(messageId);

  try {
    if (isRoomFakeEnabled()) {
      const { fakeDismissMessageProposal } = await import("./e2e-fake");
      return await fakeDismissMessageProposal(parsedMessageId);
    }

    const supabase = await createClient(new Headers());
    const { data, error } = await supabase.rpc("dismiss_message_proposal", {
      target_message_id: parsedMessageId,
    });
    // Thrown rather than flattened here so the single catch below is the one
    // place the reason is logged and the one place the user-facing string is
    // chosen -- a Zod failure on a *successful* response reaches it the same
    // way an RPC error does.
    if (error) throw error;
    return ProposalResponseSchema.parse(firstRow(data));
  } catch (reason) {
    logProposalFailure("dismissal", reason);
    throw new Error(DISMISS_ERROR);
  }
}

export async function acceptPrdMessageProposal(
  messageId: string,
  taskId: string,
): Promise<ProposalResponse> {
  const parsedMessageId = MessageIdSchema.parse(messageId);
  const parsedTaskId = MessageIdSchema.parse(taskId);

  try {
    if (isRoomFakeEnabled()) {
      const { fakeAcceptPrdMessageProposal } = await import("./e2e-fake");
      return await fakeAcceptPrdMessageProposal(parsedMessageId, parsedTaskId);
    }

    const supabase = await createClient(new Headers());
    const { data, error } = await supabase.rpc("accept_prd_message_proposal", {
      target_message_id: parsedMessageId,
      target_task_id: parsedTaskId,
    });
    if (error) throw error;
    return ProposalResponseSchema.parse(firstRow(data));
  } catch (reason) {
    logProposalFailure("PRD acceptance", reason);
    throw new Error(ACCEPT_PRD_ERROR);
  }
}

export async function captureProposedDecision(
  messageId: string,
): Promise<CapturedDecision> {
  const parsedMessageId = MessageIdSchema.parse(messageId);

  try {
    if (isRoomFakeEnabled()) {
      const { fakeCaptureProposedDecision } = await import("./e2e-fake");
      return await fakeCaptureProposedDecision(parsedMessageId);
    }

    const supabase = await createClient(new Headers());
    const { data, error } = await supabase.rpc("capture_proposed_decision", {
      target_message_id: parsedMessageId,
    });
    if (error) throw error;
    const decision = DecisionRowSchema.parse(firstRow(data));
    return { id: decision.id, summary: decision.summary };
  } catch (reason) {
    logProposalFailure("decision capture", reason);
    throw new Error(CAPTURE_ERROR);
  }
}

export async function acceptProposedUserFlow(
  messageId: string,
): Promise<AcceptedUserFlow> {
  const parsedMessageId = MessageIdSchema.parse(messageId);

  try {
    if (isRoomFakeEnabled()) {
      const { fakeAcceptProposedUserFlow } = await import("./e2e-fake");
      return await fakeAcceptProposedUserFlow(parsedMessageId);
    }

    const supabase = await createClient(new Headers());
    const { data, error } = await supabase.rpc("accept_proposed_user_flow", {
      target_message_id: parsedMessageId,
    });
    if (error) throw error;
    const accepted = AcceptedUserFlowSchema.parse(firstRow(data));
    return {
      roomId: accepted.user_flow.room_id,
      taskId: accepted.task.id,
    };
  } catch (reason) {
    logProposalFailure("user flow acceptance", reason);
    throw new Error(
      isMissingAgentDevice(reason) ? AGENT_DEVICE_ERROR : ACCEPT_ERROR,
    );
  }
}

// Durable dismissal is only durable if it is read back. Row-level security
// already narrows this to the caller's own responses in Rooms they still
// participate in, so the read needs no filter beyond the Room itself. A failed
// read leaves every proposal unanswered rather than breaking the Room.
export async function listRoomProposalResponses(
  roomId: string,
): Promise<Record<string, ProposalResponse>> {
  const parsedRoomId = RoomIdSchema.safeParse(roomId);
  if (!parsedRoomId.success) return {};

  try {
    if (isRoomFakeEnabled()) {
      const { fakeListRoomProposalResponses } = await import("./e2e-fake");
      return await fakeListRoomProposalResponses(parsedRoomId.data);
    }

    const supabase = await createClient(new Headers());
    const { data, error } = await supabase
      .from("message_proposal_responses")
      .select("message_id, response, messages!inner(room_id)")
      .eq("messages.room_id", parsedRoomId.data);
    if (error) throw error;

    const responses: Record<string, ProposalResponse> = {};
    for (const row of Array.isArray(data) ? data : []) {
      const parsed = ProposalResponseRowSchema.safeParse(row);
      if (parsed.success) {
        responses[parsed.data.message_id] = parsed.data.response;
      }
    }
    return responses;
  } catch (reason) {
    logProposalFailure("response read", reason);
    return {};
  }
}
