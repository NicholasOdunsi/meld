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

  it("does not project a follow-up's own task as a separate Star", () => {
    const snapshot = buildStreamSnapshot({
      ...base,
      messages: [message({ id: "m1", body: "Review checkout" }), message({ id: "m3", clientId: "c3", body: "Also tax" })],
      taskStatuses: [task({}), task({ taskId: "t2", sourceMessageId: "m3" })],
      starMetadata: [{ taskId: "t1", title: "Checkout review", constellation: null, followupMessageIds: ["m3"] }],
    });
    expect(snapshot.stars.map((star) => star.id)).toEqual(["t1"]);
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

  it("reports built screens and the activity of running tasks without treating empty placeholders as builds", () => {
    const snapshot = buildStreamSnapshot({
      ...base,
      taskStatuses: [task({ taskId: "d1", kind: "design_screen_generate", status: "running", sourceMessageId: null })],
      screenRows: [
        { id: "s1", name: "Balance", state: "built", updating: false, currentVersionId: "v1", formFactor: "mobile", createdAt: "2026-11-15T10:00:00.000Z" },
        { id: "s2", name: "Card", state: "empty", updating: false, currentVersionId: null, formFactor: "mobile", createdAt: "2026-11-15T10:05:00.000Z", generationTaskId: "d1" },
        { id: "flow-placeholder", name: "Flow", state: "empty", updating: false, currentVersionId: null, formFactor: "mobile", createdAt: "2026-11-15T10:06:00.000Z" },
      ],
    });
    expect(snapshot.screens.map((screen) => [screen.id, screen.state, screen.versionId])).toEqual([
      ["s1", "built", "v1"],
      ["s2", "building", null],
    ]);
    expect(snapshot.activity).toEqual([
      { taskId: "d1", starId: null, phase: "designing", screenName: "Card" },
    ]);
  });

  it("does not mark unrelated empty screens failed when a design task fails", () => {
    const snapshot = buildStreamSnapshot({
      ...base,
      taskStatuses: [task({ taskId: "d1", kind: "design_screen_generate", status: "failed", sourceMessageId: null })],
      screenRows: [
        { id: "s2", name: "Card", state: "empty", updating: false, currentVersionId: null, formFactor: "mobile", createdAt: "2026-11-15T10:05:00.000Z" },
        { id: "s3", name: "Attempt", state: "empty", updating: false, currentVersionId: null, formFactor: "mobile", createdAt: "2026-11-15T10:06:00.000Z", generationTaskId: "d1" },
      ],
    });
    expect(snapshot.screens.map((screen) => [screen.id, screen.state])).toEqual([["s3", "failed"]]);
  });
  it("attaches a screen to the Star whose reply proposed it", () => {
    const row = (id: string, sourceMessageId: string | null) => ({
      id, name: id, state: "built" as const, updating: false, currentVersionId: `v-${id}`,
      formFactor: "desktop" as const, createdAt: "2026-11-15T10:00:00.000Z", sourceMessageId,
    });
    const snapshot = buildStreamSnapshot({
      ...base,
      messages: [
        message({ id: "q1", body: "design a dashboard" }),
        message({ id: "a1", authorType: "product_agent", authorId: null, aiTaskId: "t1", body: "On it" }),
        message({ id: "q2", body: "make it darker" }),
        message({ id: "a2", authorType: "product_agent", authorId: null, aiTaskId: "t2", body: "Darker" }),
      ],
      taskStatuses: [
        task({ taskId: "t1", sourceMessageId: "q1" }),
        task({ taskId: "t2", sourceMessageId: "q2" }),
      ],
      starMetadata: [{ taskId: "t1", title: "Dashboard", constellation: null, followupMessageIds: ["q2"] }],
      screenRows: [row("from-star", "a1"), row("from-followup", "a2"), row("no-source", null), row("unknown", "missing")],
    });
    expect(snapshot.screens.map((screen) => [screen.id, screen.starId])).toEqual([
      ["from-star", "t1"], ["from-followup", "t1"], ["no-source", null], ["unknown", null],
    ]);
  });
});
