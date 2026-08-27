import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  isCanvasTrialEnabled: vi.fn(() => true),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("./canvas-session", () => ({
  isCanvasTrialEnabled: mocks.isCanvasTrialEnabled,
}));

import {
  generateUserFlow,
  listUnappliedUserFlowGenerations,
  markUserFlowGenerationApplied,
} from "./user-flow-generation";
import {
  hasStructuredConversationContext,
  USER_FLOW_CONTEXT_QUESTION,
} from "./user-flow-generation-context";

const roomId = "40000000-0000-4000-8000-000000000004";
const taskId = "70000000-0000-4000-8000-000000000007";
const generationRow = {
  task_id: taskId,
  room_id: roomId,
  document: {
    title: "Account recovery",
    summary: "A user regains account access.",
    nodes: [
      { id: "start", kind: "start", label: "Recovery opened", detail: null },
      { id: "end", kind: "end", label: "Access restored", detail: null },
    ],
    edges: [{ id: "e1", from: "start", to: "end", label: null }],
    openQuestions: [],
  },
  application_mode: "append",
  created_at: "2026-08-10T12:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isCanvasTrialEnabled.mockReturnValue(true);
});

describe("user flow generation actions", () => {
  it("requires goal, start, and outcome signals in pre-PRD conversation", () => {
    expect(hasStructuredConversationContext([{ body: "This is a general planning discussion." }])).toBe(false);
    expect(hasStructuredConversationContext([
      { body: "Users need to recover their account." },
      { body: "They start from the sign-in page." },
      { body: "Success means access is restored so that they can continue." },
    ])).toBe(true);
  });

  it("returns the fixed clarification without queuing weak context", async () => {
    const from = vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => table === "prds"
          ? { limit: vi.fn().mockResolvedValue({ data: [], error: null }) }
          : {
              order: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue({
                  data: [{ body: "This is a general planning discussion." }],
                  error: null,
                }),
              })),
            }),
      })),
    }));
    const rpc = vi.fn();
    mocks.createClient.mockResolvedValue({ from, rpc });

    await expect(generateUserFlow({ roomId })).resolves.toEqual({
      status: "needs_context",
      question: USER_FLOW_CONTEXT_QUESTION,
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("strictly parses recovery rows and acknowledges an applied generation", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === "list_unapplied_user_flow_generations") {
        return { data: [generationRow], error: null };
      }
      return { data: true, error: null };
    });
    mocks.createClient.mockResolvedValue({ rpc });

    await expect(listUnappliedUserFlowGenerations(roomId)).resolves.toEqual([
      expect.objectContaining({ taskId, roomId, applicationMode: "append" }),
    ]);
    await expect(markUserFlowGenerationApplied(taskId)).resolves.toBe(true);
  });

  it("parses a recovery row whose timestamp uses a numeric offset instead of Z", async () => {
    // PostgREST/Postgres render timestamptz as "...+00:00", not "...Z" -- the
    // real shape returned by list_unapplied_user_flow_generations in
    // production, unlike every other row in this file which uses the Z form
    // and so never exercised this path.
    const rpc = vi.fn().mockResolvedValue({
      data: [{ ...generationRow, created_at: "2026-08-10T12:00:00.000000+00:00" }],
      error: null,
    });
    mocks.createClient.mockResolvedValue({ rpc });

    await expect(listUnappliedUserFlowGenerations(roomId)).resolves.toEqual([
      expect.objectContaining({ taskId, roomId }),
    ]);
  });

  it("drops malformed recovery rows instead of partially applying them", async () => {
    mocks.createClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({
        data: [{ ...generationRow, document: { title: "broken" } }],
        error: null,
      }),
    });
    await expect(listUnappliedUserFlowGenerations(roomId)).resolves.toEqual([]);
  });
});
