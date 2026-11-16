import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  resolveAgentReadiness: vi.fn(),
  readStarMetadata: vi.fn(),
  cancelAITask: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/features/ai/agent-readiness", () => ({ resolveAgentReadiness: mocks.resolveAgentReadiness }));
vi.mock("./star-store", () => ({ readStarMetadata: mocks.readStarMetadata }));
vi.mock("@/features/ai/task-service", () => ({ cancelAITask: mocks.cancelAITask }));

import { routeMainChatMessage, validatedRouteChoice } from "./star-route";

const stars = [{ id: "10000000-0000-4000-8000-000000000001", title: "Profile screen" }];
const roomId = "40000000-0000-4000-8000-000000000001";
const taskId = "50000000-0000-4000-8000-000000000001";
const rpc = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockReset();
  mocks.cancelAITask.mockResolvedValue({});
  mocks.createClient.mockResolvedValue({ rpc });
  mocks.resolveAgentReadiness.mockResolvedValue({
    ready: true, defaultProvider: "codex", defaultDeviceId: "30000000-0000-4000-8000-000000000001",
    providers: [{ provider: "codex", deviceId: "30000000-0000-4000-8000-000000000001" }],
  });
  mocks.readStarMetadata.mockResolvedValue({ stars: [{ taskId: stars[0].id, title: stars[0].title }], constellations: [] });
});

describe("Star route validation", () => {
  it("keeps a valid continuation and asks on uncertainty", () => {
    expect(validatedRouteChoice({ decision: "continue", starTaskId: stars[0].id, confidence: 0.9 }, stars))
      .toEqual({ decision: "continue", starTaskId: stars[0].id, title: "Profile screen" });
    expect(validatedRouteChoice({ decision: "ask", starTaskId: stars[0].id, confidence: 0.5 }, stars).decision)
      .toBe("ask");
  });

  it("falls back to new for an unknown Star or malformed result", () => {
    for (const result of [
      { decision: "continue", starTaskId: "20000000-0000-4000-8000-000000000002", confidence: 0.9 },
      { decision: "ask", starTaskId: null, confidence: 0.5 },
      { decision: "new", starTaskId: null, confidence: 0.9 },
      null,
    ]) expect(validatedRouteChoice(result, stars)).toEqual({ decision: "new", starTaskId: null, title: null });
  });
});

describe("pre-send Star routing", () => {
  it("does not create a task when there are no candidates", async () => {
    expect(await routeMainChatMessage({ roomId, body: "Hello", stars: [] })).toEqual({ decision: "new", starTaskId: null, title: null });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("keeps the message unsent and selects a verified Star", async () => {
    rpc.mockImplementation(async (name: string) => name === "create_ai_task"
      ? { data: { id: taskId }, error: null }
      : { data: { decision: "continue", starTaskId: stars[0].id, confidence: 0.9 }, error: null });
    expect(await routeMainChatMessage({ roomId, body: "Change its colors", stars })).toEqual({
      decision: "continue", starTaskId: stars[0].id, title: stars[0].title,
    });
    expect(rpc).toHaveBeenCalledWith("create_ai_task", expect.objectContaining({
      target_kind: "star_route",
      target_manifest: { messageIds: [], attachmentIds: [], evidenceIds: [], decisionIds: [] },
    }));
  });

  it("ignores a candidate that the room does not own", async () => {
    mocks.readStarMetadata.mockResolvedValue({ stars: [], constellations: [] });
    expect(await routeMainChatMessage({ roomId, body: "Change its colors", stars })).toEqual({
      decision: "new", starTaskId: null, title: null,
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("falls back to new when the provider fails", async () => {
    rpc.mockImplementation(async (name: string) => name === "create_ai_task"
      ? { data: { id: taskId }, error: null }
      : { data: null, error: new Error("offline") });
    expect(await routeMainChatMessage({ roomId, body: "Change its colors", stars })).toEqual({
      decision: "new", starTaskId: null, title: null,
    });
    expect(mocks.cancelAITask).toHaveBeenCalled();
  });

  it("returns at the deadline even when metadata never responds", async () => {
    vi.useFakeTimers();
    try {
      mocks.readStarMetadata.mockImplementation(() => new Promise(() => {}));
      const result = routeMainChatMessage({ roomId, body: "Change its colors", stars });
      await vi.advanceTimersByTimeAsync(3_000);
      expect(await result).toEqual({ decision: "new", starTaskId: null, title: null });
      expect(rpc).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
