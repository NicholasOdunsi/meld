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
const CAPTURE_ERROR = "We could not capture that decision.";
const ACCEPT_ERROR = "We could not create that user flow.";

function firstRow(data: unknown): unknown {
  return Array.isArray(data) ? data[0] : data;
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
    if (error) throw new Error(DISMISS_ERROR);
    return ProposalResponseSchema.parse(firstRow(data));
  } catch {
    throw new Error(DISMISS_ERROR);
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
    if (error) throw new Error(CAPTURE_ERROR);
    const decision = DecisionRowSchema.parse(firstRow(data));
    return { id: decision.id, summary: decision.summary };
  } catch {
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
    if (error) throw new Error(ACCEPT_ERROR);
    const accepted = AcceptedUserFlowSchema.parse(firstRow(data));
    return {
      roomId: accepted.user_flow.room_id,
      taskId: accepted.task.id,
    };
  } catch {
    throw new Error(ACCEPT_ERROR);
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
    if (error) return {};

    const responses: Record<string, ProposalResponse> = {};
    for (const row of Array.isArray(data) ? data : []) {
      const parsed = ProposalResponseRowSchema.safeParse(row);
      if (parsed.success) {
        responses[parsed.data.message_id] = parsed.data.response;
      }
    }
    return responses;
  } catch {
    return {};
  }
}
