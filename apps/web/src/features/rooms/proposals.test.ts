import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import {
  acceptProposedUserFlow,
  captureProposedDecision,
  dismissMessageProposal,
  listRoomProposalResponses,
} from "./proposals";

const roomId = "40000000-0000-4000-8000-000000000004";
const messageId = "50000000-0000-4000-8000-000000000005";
const otherMessageId = "50000000-0000-4000-8000-000000000006";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("dismissMessageProposal", () => {
  it("records the caller's dismissal through the response function", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "dismissed", error: null });
    mocks.createClient.mockResolvedValue({ rpc });

    await expect(dismissMessageProposal(messageId)).resolves.toBe("dismissed");
    expect(rpc).toHaveBeenCalledWith("dismiss_message_proposal", {
      target_message_id: messageId,
    });
  });

  it("rejects an invalid message id before opening a database client", async () => {
    await expect(dismissMessageProposal("not-a-message")).rejects.toThrow();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("uses a stable error without exposing database details", async () => {
    mocks.createClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "permission internals" },
      }),
    });

    await expect(dismissMessageProposal(messageId)).rejects.toThrow(
      "We could not dismiss that suggestion.",
    );
  });
});

describe("captureProposedDecision", () => {
  it("returns the one Decision the proposal produces across retries", async () => {
    const decision = {
      id: "60000000-0000-4000-8000-000000000007",
      room_id: roomId,
      source_message_id: null,
      summary: "Keep recovery codes single-use.",
      created_by: "10000000-0000-4000-8000-000000000001",
      created_at: "2026-08-11T12:00:00+00:00",
      proposal_message_id: messageId,
    };
    const rpc = vi.fn().mockResolvedValue({ data: decision, error: null });
    mocks.createClient.mockResolvedValue({ rpc });

    const first = await captureProposedDecision(messageId);
    const retry = await captureProposedDecision(messageId);

    expect(first).toEqual({
      id: decision.id,
      summary: "Keep recovery codes single-use.",
    });
    expect(retry).toEqual(first);
    expect(rpc).toHaveBeenLastCalledWith("capture_proposed_decision", {
      target_message_id: messageId,
    });
  });

  it("uses a stable error without exposing database details", async () => {
    mocks.createClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "Decision proposal required" },
      }),
    });

    await expect(captureProposedDecision(messageId)).rejects.toThrow(
      "We could not capture that decision.",
    );
  });
});

describe("acceptProposedUserFlow", () => {
  it("starts the flow and returns its generation task", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        user_flow: {
          room_id: roomId,
          created_by: "10000000-0000-4000-8000-000000000001",
          created_at: "2026-08-11T12:00:00+00:00",
        },
        task: {
          id: "70000000-0000-4000-8000-000000000008",
          roomId,
          provider: "codex",
          kind: "user_flow_generate",
          status: "queued",
          createdAt: "2026-08-11T12:00:00+00:00",
          updatedAt: "2026-08-11T12:00:00+00:00",
        },
      },
      error: null,
    });
    mocks.createClient.mockResolvedValue({ rpc });

    await expect(acceptProposedUserFlow(messageId)).resolves.toEqual({
      roomId,
      taskId: "70000000-0000-4000-8000-000000000008",
    });
    expect(rpc).toHaveBeenCalledWith("accept_proposed_user_flow", {
      target_message_id: messageId,
    });
  });

  it("uses a stable error when acceptance is refused", async () => {
    mocks.createClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "User flow edit access required" },
      }),
    });

    await expect(acceptProposedUserFlow(messageId)).rejects.toThrow(
      "We could not create that user flow.",
    );
  });

  it("uses the same stable error for an unrecognized response", async () => {
    mocks.createClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ data: { task: {} }, error: null }),
    });

    await expect(acceptProposedUserFlow(messageId)).rejects.toThrow(
      "We could not create that user flow.",
    );
  });
});

describe("listRoomProposalResponses", () => {
  it("reads the caller's own responses for the Room", async () => {
    const eq = vi.fn().mockResolvedValue({
      data: [
        { message_id: messageId, response: "dismissed" },
        { message_id: otherMessageId, response: "accepted" },
      ],
      error: null,
    });
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    mocks.createClient.mockResolvedValue({ from });

    await expect(listRoomProposalResponses(roomId)).resolves.toEqual({
      [messageId]: "dismissed",
      [otherMessageId]: "accepted",
    });
    expect(from).toHaveBeenCalledWith("message_proposal_responses");
    expect(select).toHaveBeenCalledWith(
      "message_id, response, messages!inner(room_id)",
    );
    expect(eq).toHaveBeenCalledWith("messages.room_id", roomId);
  });

  it("leaves the Room usable when the response read fails", async () => {
    const eq = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "permission internals" },
    });
    mocks.createClient.mockResolvedValue({
      from: () => ({ select: () => ({ eq }) }),
    });

    await expect(listRoomProposalResponses(roomId)).resolves.toEqual({});
  });

  it("drops rows that are not a known response", async () => {
    const eq = vi.fn().mockResolvedValue({
      data: [
        { message_id: messageId, response: "maybe" },
        { message_id: otherMessageId, response: "accepted" },
      ],
      error: null,
    });
    mocks.createClient.mockResolvedValue({
      from: () => ({ select: () => ({ eq }) }),
    });

    await expect(listRoomProposalResponses(roomId)).resolves.toEqual({
      [otherMessageId]: "accepted",
    });
  });
});
