// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentReadiness } from "@/features/ai/agent-readiness";
import type { RoomMessage } from "@/features/rooms/repository";

const mocks = vi.hoisted(() => ({
  postMessage: vi.fn(),
  stageRoomAttachment: vi.fn(),
  discardStagedRoomAttachment: vi.fn(),
  listRoomTaskStatuses: vi.fn(),
  listRoomStarMetadata: vi.fn(),
  linkRoomStarFollowup: vi.fn(),
  renameRoomStar: vi.fn(),
  setRoomStarConstellation: vi.fn(),
  renameRoomConstellation: vi.fn(),
  generateDesignScreen: vi.fn(),
  dismissMessageProposal: vi.fn(),
  listRoomScreenFeed: vi.fn(),
  loadRoomScreen: vi.fn(),
  onMessage: undefined as ((message: unknown) => void) | undefined,
  unsubscribe: vi.fn(),
}));
vi.mock("@/features/design/design-screen-generation", () => ({ generateDesignScreen: mocks.generateDesignScreen }));
vi.mock("@/features/rooms/proposals", () => ({ dismissMessageProposal: mocks.dismissMessageProposal }));
vi.mock("./screen-feed", () => ({ listRoomScreenFeed: mocks.listRoomScreenFeed }));
vi.mock("@/features/canvas-excalidraw/load-screen", () => ({ loadRoomScreen: mocks.loadRoomScreen }));
vi.mock("@/features/canvas/screen-preview-doc", () => ({ buildFramePreviewDoc: () => "<html>doc</html>" }));

vi.mock("@/features/rooms/actions", () => ({
  postMessage: mocks.postMessage,
  stageRoomAttachment: mocks.stageRoomAttachment,
  discardStagedRoomAttachment: mocks.discardStagedRoomAttachment,
  listRoomTaskStatuses: mocks.listRoomTaskStatuses,
}));
vi.mock("@/features/rooms/star-actions", () => ({
  listRoomStarMetadata: mocks.listRoomStarMetadata,
  linkRoomStarFollowup: mocks.linkRoomStarFollowup,
  renameRoomStar: mocks.renameRoomStar,
  setRoomStarConstellation: mocks.setRoomStarConstellation,
  renameRoomConstellation: mocks.renameRoomConstellation,
}));
vi.mock("@/features/rooms/room-message-subscription", () => ({
  subscribeToProductionRoom: (_roomId: string, onMessage: (message: unknown) => void) => {
    mocks.onMessage = onMessage;
    return mocks.unsubscribe;
  },
  subscribeToDevelopmentRoom: (_roomId: string, onMessage: (message: unknown) => void) => {
    mocks.onMessage = onMessage;
    return mocks.unsubscribe;
  },
}));

import type { StreamHandlers } from "./bridge";
import { NativeStreamBridge } from "./native-stream-bridge";

type TestWindow = Window & { webkit?: unknown; __orionStream?: StreamHandlers };

function message(overrides: Partial<RoomMessage>): RoomMessage {
  return {
    id: "m1",
    roomId: "r1",
    clientId: "c1",
    authorType: "human",
    authorId: "u1",
    initiatedBy: null,
    aiTaskId: null,
    provider: null,
    body: "hello",
    citedMessageIds: [],
    citedEvidenceIds: [],
    assumptions: [],
    suggestedNextQuestions: [],
    proposedAction: null,
    kind: "conversation",
    prdContext: null,
    prdChange: null,
    attachments: [],
    createdAt: "2026-11-14T10:00:00.000Z",
    delivery: "persisted",
    ...overrides,
  };
}

const readiness: AgentReadiness = {
  ready: true,
  defaultProvider: "claude",
  defaultDeviceId: "d1",
  providers: [{ provider: "claude", deviceId: "d1", deviceName: "Mac", models: ["sonnet"], defaultModel: "sonnet" }],
};

const props = {
  roomId: "r1",
  projectId: "p1",
  currentUser: { id: "u1", name: "Odunsi" },
  participants: [{ userId: "u1", email: "odunsi@example.com" }],
  initialMessages: [message({})],
  realtimeMode: "production" as const,
  readiness,
};

describe("NativeStreamBridge", () => {
  let nativePost: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    nativePost = vi.fn();
    mocks.listRoomTaskStatuses.mockResolvedValue([]);
    mocks.listRoomStarMetadata.mockResolvedValue({ stars: [], constellations: [] });
    mocks.listRoomScreenFeed.mockResolvedValue([]);
    mocks.generateDesignScreen.mockResolvedValue({ status: "queued", taskId: "d1", screenId: "s1" });
    mocks.dismissMessageProposal.mockResolvedValue({});
    (window as TestWindow).webkit = { messageHandlers: { orion: { postMessage: nativePost } } };
  });
  afterEach(() => {
    delete (window as TestWindow).webkit;
    vi.clearAllMocks();
  });

  const streamPosts = () =>
    nativePost.mock.calls.map((call) => call[0]).filter((m) => m.type === "stream");

  it("posts the stream snapshot on mount", async () => {
    render(<NativeStreamBridge {...props} />);
    await act(async () => {});
    const last = streamPosts().at(-1);
    expect(last).toMatchObject({
      v: 1,
      type: "stream",
      roomId: "r1",
      projectId: "p1",
      currentUserName: "Odunsi",
      send: { canSend: true },
    });
    expect(last.messages).toHaveLength(1);
    expect(last.messages[0]).toMatchObject({ id: "m1", authorName: "Odunsi", text: "hello" });
  });

  it("posts again when a realtime message arrives", async () => {
    render(<NativeStreamBridge {...props} />);
    await act(async () => {});
    await act(async () => {
      mocks.onMessage?.(
        message({
          id: "m2",
          clientId: "c2",
          authorType: "product_agent",
          authorId: null,
          aiTaskId: "t1",
          body: "On it.",
          createdAt: "2026-11-14T10:01:00.000Z",
        }),
      );
    });
    const last = streamPosts().at(-1);
    expect(last.messages.map((row: { id: string }) => row.id)).toEqual(["m1", "m2"]);
    expect(last.messages[1]).toMatchObject({ authorKind: "orion", authorName: "Orion" });
  });

  it("registers post, which sends a Product Agent message and reports ok", async () => {
    mocks.postMessage.mockResolvedValue({
      message: message({ id: "m3", clientId: "c3", body: "Hi Orion", createdAt: "2026-11-14T10:02:00.000Z" }),
      agentTask: { status: "queued", taskId: "t9" },
    });
    render(<NativeStreamBridge {...props} />);
    await act(async () => {});
    let result: unknown;
    await act(async () => {
      result = await (window as TestWindow).__orionStream!.post({
        roomId: "r1",
        body: "Hi Orion",
        providerOverride: "claude",
        modelOverride: "sonnet",
      });
    });
    expect(result).toEqual({ status: "ok" });
    expect(mocks.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: "r1",
        body: "Hi Orion",
        mentionedUserIds: [],
        mentionsProductAgent: true,
        agentKind: "product",
        providerOverride: "claude",
        modelOverride: "sonnet",
        clientId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      }),
    );
    // The new message shows without waiting for realtime.
    expect(streamPosts().at(-1).messages.map((row: { id: string }) => row.id)).toContain("m3");
  });

  it("sends a reply inside a Star as a follow-up of that Star", async () => {
    mocks.postMessage.mockResolvedValue({
      message: message({ id: "m6", body: "A follow-up" }),
      agentTask: { status: "queued", taskId: "t10" },
    });
    render(<NativeStreamBridge {...props} />);
    await act(async () => {});
    await act(async () => {
      await (window as TestWindow).__orionStream!.post({
        roomId: "r1", body: "A follow-up", starTaskId: "t1", starTitle: "Checkout",
      });
    });
    expect(mocks.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ roomId: "r1", starFollowupOfTaskId: "t1" }),
    );
    expect(mocks.linkRoomStarFollowup).not.toHaveBeenCalled();
  });

  it("reports an error when Orion could not be asked to reply, but keeps the message", async () => {
    mocks.postMessage.mockResolvedValue({
      message: message({ id: "m4", clientId: "c4", body: "Hi", createdAt: "2026-11-14T10:03:00.000Z" }),
      agentTask: { status: "retryable_error", message: "We could not ask the agent to reply. Please try again." },
    });
    render(<NativeStreamBridge {...props} />);
    await act(async () => {});
    let result: unknown;
    await act(async () => {
      result = await (window as TestWindow).__orionStream!.post({ roomId: "r1", body: "Hi" });
    });
    expect(result).toEqual({ status: "error", message: "We could not ask the agent to reply. Please try again." });
    expect(streamPosts().at(-1).messages.map((row: { id: string }) => row.id)).toContain("m4");
  });

  it("stages a native file and passes its ID when sending", async () => {
    mocks.stageRoomAttachment.mockResolvedValue({ id: "a0000000-0000-4000-8000-000000000001" });
    mocks.postMessage.mockResolvedValue({
      message: message({ id: "m5", body: "with file" }),
      agentTask: { status: "queued", taskId: "t9" },
    });
    render(<NativeStreamBridge {...props} />);
    await act(async () => {});
    const bridge = (window as TestWindow).__orionStream!;
    let staged: unknown;
    await act(async () => {
      staged = await bridge.stage({ roomId: "r1", name: "notes.txt", mimeType: "text/plain", base64: btoa("hello") });
    });
    expect(staged).toEqual({ status: "ok", path: "/staged/a0000000-0000-4000-8000-000000000001" });
    expect(mocks.stageRoomAttachment).toHaveBeenCalledWith(expect.any(FormData));
    await act(async () => {
      await bridge.post({ roomId: "r1", body: "with file", attachmentIds: ["a0000000-0000-4000-8000-000000000001"] });
    });
    expect(mocks.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      attachmentIds: ["a0000000-0000-4000-8000-000000000001"],
    }));
  });

  it("reports a plain error when sending throws", async () => {
    mocks.postMessage.mockRejectedValue(new Error("boom"));
    render(<NativeStreamBridge {...props} />);
    await act(async () => {});
    let result: unknown;
    await act(async () => {
      result = await (window as TestWindow).__orionStream!.post({ roomId: "r1", body: "Hi" });
    });
    expect(result).toEqual({ status: "error", message: "Orion couldn't send that right now. Try again." });
  });

  it("ignores a post for a different room and an empty body", async () => {
    render(<NativeStreamBridge {...props} />);
    await act(async () => {});
    const post = (window as TestWindow).__orionStream!.post;
    await act(async () => {
      expect(await post({ roomId: "other", body: "x" })).toMatchObject({ status: "error" });
      expect(await post({ roomId: "r1", body: "   " })).toMatchObject({ status: "error" });
    });
    expect(mocks.postMessage).not.toHaveBeenCalled();
  });

  it("unsubscribes and unregisters on unmount", async () => {
    const { unmount } = render(<NativeStreamBridge {...props} />);
    await act(async () => {});
    unmount();
    expect(mocks.unsubscribe).toHaveBeenCalled();
    expect((window as TestWindow).__orionStream).toBeUndefined();
  });

  it("starts a new Product Agent design proposal only once", async () => {
    render(<NativeStreamBridge {...props} />);
    await act(async () => {});
    const reply = message({ id: "m9", clientId: "c9", authorType: "product_agent", authorId: null,
      aiTaskId: "t1", body: "On it.", createdAt: new Date().toISOString(),
      proposedAction: { kind: "design_screen", instruction: "A fintech balance screen", name: "Balance", screenId: null } });
    await act(async () => { mocks.onMessage?.(reply); });
    await act(async () => { mocks.onMessage?.(reply); });
    expect(mocks.generateDesignScreen).toHaveBeenCalledTimes(1);
    expect(mocks.generateDesignScreen).toHaveBeenCalledWith({ roomId: "r1", name: "Balance", instruction: "A fintech balance screen" });
    expect(mocks.dismissMessageProposal).toHaveBeenCalledWith("m9");
  });

  it("does not rebuild an old proposal", async () => {
    const old = message({ id: "m8", authorType: "product_agent", authorId: null, aiTaskId: "t1",
      proposedAction: { kind: "design_screen", instruction: "Old", name: null, screenId: null } });
    render(<NativeStreamBridge {...props} initialMessages={[old]} />);
    await act(async () => {});
    expect(mocks.generateDesignScreen).not.toHaveBeenCalled();
  });

  it("builds directly for @Design Agent", async () => {
    render(<NativeStreamBridge {...props} />);
    await act(async () => {});
    let result: unknown;
    await act(async () => { result = await (window as TestWindow).__orionStream!.post({ roomId: "r1", body: "@Design Agent a login screen" }); });
    expect(result).toEqual({ status: "ok" });
    expect(mocks.generateDesignScreen).toHaveBeenCalledWith({ roomId: "r1", instruction: "a login screen" });
    expect(mocks.postMessage).not.toHaveBeenCalled();
  });

  it("sends a built screen document once per version", async () => {
    mocks.listRoomScreenFeed.mockResolvedValue([{ id: "s1", name: "Balance", state: "built", updating: false,
      currentVersionId: "v1", formFactor: "mobile", createdAt: "2026-11-15T10:00:00.000Z" }]);
    mocks.loadRoomScreen.mockResolvedValue({ id: "s1", name: "Balance", state: "built" });
    render(<NativeStreamBridge {...props} />);
    await act(async () => {});
    await act(async () => {});
    const docs = nativePost.mock.calls.map((call) => call[0]).filter((entry) => entry.type === "screen");
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ v: 1, roomId: "r1", screenId: "s1", versionId: "v1", html: "<html>doc</html>" });
  });
});
