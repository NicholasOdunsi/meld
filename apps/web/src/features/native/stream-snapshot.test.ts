import { describe, expect, it } from "vitest";
import type { AgentReadiness } from "@/features/ai/agent-readiness";
import type { RoomTaskStatus } from "@/features/ai/room-task-status";
import type { RoomMessage } from "@/features/rooms/repository";
import { buildStreamSnapshot } from "./stream-snapshot";

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

function task(overrides: Partial<RoomTaskStatus>): RoomTaskStatus {
  return {
    taskId: "t1",
    sourceMessageId: "m1",
    initiatingUserId: "u1",
    provider: "claude",
    kind: "room_reply",
    agentKind: "product",
    status: "completed",
    createdAt: "2026-11-14T10:00:01.000Z",
    updatedAt: "2026-11-14T10:00:02.000Z",
    ...overrides,
  };
}

const ready: AgentReadiness = {
  ready: true,
  defaultProvider: "claude",
  defaultDeviceId: "d1",
  providers: [
    { provider: "claude", deviceId: "d1", deviceName: "Mac", models: ["sonnet", "opus"], defaultModel: "sonnet" },
    { provider: "codex", deviceId: "d1", deviceName: "Mac" },
  ],
};

const base = {
  roomId: "r1",
  projectId: "p1",
  currentUser: { id: "u1", name: "Odunsi" },
  participants: [{ userId: "u1", email: "odunsi@example.com" }],
  messages: [] as RoomMessage[],
  taskStatuses: [] as RoomTaskStatus[],
  readiness: ready,
};

describe("buildStreamSnapshot", () => {
  it("uses saved Star names, Constellations, and follow-ups", () => {
    const snapshot = buildStreamSnapshot({
      ...base,
      messages: [message({ id: "m1", body: "Review checkout" })],
      taskStatuses: [task({ status: "running" })],
      starMetadata: [{ taskId: "t1", title: "Checkout review", constellation: "Payments",
        followupMessageIds: ["m2"] }],
      constellations: [{ id: "g1", name: "Payments" }],
    });
    expect(snapshot.stars[0]).toMatchObject({ title: "Checkout review", status: "working",
      constellation: "Payments", followupMessageIds: ["m2"] });
    expect(snapshot.constellations).toEqual(["Payments"]);
  });

  it("marks failed work as stuck and excludes tasks without a request", () => {
    const snapshot = buildStreamSnapshot({
      ...base,
      messages: [message({ id: "m1", body: "Review checkout" })],
      taskStatuses: [task({ status: "failed" }), task({ taskId: "t2", sourceMessageId: null })],
    });
    expect(snapshot.stars).toHaveLength(1);
    expect(snapshot.stars[0].status).toBe("stuck");
  });

  it("keeps older Stars whose source message is outside the loaded page", () => {
    const snapshot = buildStreamSnapshot({ ...base, taskStatuses: [task({})] });
    expect(snapshot.stars[0]).toMatchObject({ sourceMessageId: "m1", title: "Earlier request" });
  });

  it("includes files on attachment-only messages", () => {
    const snapshot = buildStreamSnapshot({
      ...base,
      messages: [message({ body: "", attachments: [{
        id: "a1", messageId: "m1", originalName: "brief.pdf", mimeType: "application/pdf",
        caption: null, extractionStatus: "ready", viewUrl: null,
      }] })],
    });
    expect(snapshot.messages[0].attachments).toEqual([{ id: "a1", name: "brief.pdf" }]);
  });

  it("names the signed-in person from the current user and Orion for agent messages", () => {
    const snapshot = buildStreamSnapshot({
      ...base,
      messages: [
        message({ id: "m1", body: "Compare checkouts" }),
        message({
          id: "m2",
          clientId: "c2",
          authorType: "product_agent",
          authorId: null,
          aiTaskId: "t1",
          body: "Pulled 6 references.",
          createdAt: "2026-11-14T10:01:00.000Z",
        }),
      ],
      taskStatuses: [task({ taskId: "t1", sourceMessageId: "m1" })],
    });
    expect(snapshot.messages).toEqual([
      {
        id: "m1",
        authorKind: "human",
        authorId: "u1",
        authorName: "Odunsi",
        text: "Compare checkouts",
        attachments: [],
        createdAt: "2026-11-14T10:00:00.000Z",
        replyToId: null,
        delivery: "persisted",
        taskId: null,
      },
      {
        id: "m2",
        authorKind: "orion",
        authorId: null,
        authorName: "Orion",
        text: "Pulled 6 references.",
        attachments: [],
        createdAt: "2026-11-14T10:01:00.000Z",
        replyToId: "m1",
        delivery: "persisted",
        taskId: "t1",
      },
    ]);
    expect(snapshot.stars).toEqual([{
      id: "t1", sourceMessageId: "m1", title: "Compare checkouts", status: "done",
      constellation: null, createdAt: "2026-11-14T10:00:01.000Z",
      followupMessageIds: [],
    }]);
  });

  it("names another human from their email and never leaves a name empty", () => {
    const snapshot = buildStreamSnapshot({
      ...base,
      participants: [...base.participants, { userId: "u2", email: "ini@example.com" }],
      messages: [
        message({ id: "m1", authorId: "u2" }),
        message({ id: "m2", clientId: "c2", authorId: "u3", createdAt: "2026-11-14T10:01:00.000Z" }),
      ],
    });
    expect(snapshot.messages.map((row) => row.authorName)).toEqual(["ini", "Someone"]);
  });

  it("leaves replyToId null when the agent message has no known task", () => {
    const snapshot = buildStreamSnapshot({
      ...base,
      messages: [message({ id: "m2", authorType: "product_agent", authorId: null, aiTaskId: "gone" })],
    });
    expect(snapshot.messages[0].replyToId).toBeNull();
  });

  it("is busy while a task is still moving and idle once every task is terminal", () => {
    expect(buildStreamSnapshot({ ...base, taskStatuses: [task({ status: "running" })] }).orionBusy).toBe(true);
    expect(buildStreamSnapshot({ ...base, taskStatuses: [task({ status: "queued" })] }).orionBusy).toBe(true);
    expect(buildStreamSnapshot({ ...base, taskStatuses: [task({ status: "completed" })] }).orionBusy).toBe(false);
    expect(buildStreamSnapshot({ ...base, taskStatuses: [] }).orionBusy).toBe(false);
  });

  it("lists model choices from a ready device", () => {
    const snapshot = buildStreamSnapshot(base);
    expect(snapshot.send).toEqual({ canSend: true });
    expect(snapshot.defaultProvider).toBe("claude");
    expect(snapshot.choices).toEqual([
      { provider: "claude", models: ["sonnet", "opus"], defaultModel: "sonnet" },
      { provider: "codex", models: [], defaultModel: null },
    ]);
  });

  it.each([
    ["no_device", "Connect a device so Orion can answer."],
    ["offline", "Your connected device is offline."],
    ["signed_out", "Sign in to your AI tool on your device, then try again."],
    ["unsupported", "Your AI tool's version isn't supported yet."],
  ] as const)("explains why it cannot send when readiness is %s", (reason, text) => {
    const snapshot = buildStreamSnapshot({ ...base, readiness: { ready: false, reason } });
    expect(snapshot.send).toEqual({ canSend: false, reason: text });
    expect(snapshot.choices).toEqual([]);
    expect(snapshot.defaultProvider).toBeNull();
  });

  it("copies the room, project and current user through", () => {
    const snapshot = buildStreamSnapshot(base);
    expect(snapshot).toMatchObject({
      roomId: "r1",
      projectId: "p1",
      currentUserId: "u1",
      currentUserName: "Odunsi",
    });
  });
});
