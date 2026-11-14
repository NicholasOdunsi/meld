import { describe, expect, it } from "vitest";
import { reconcileMessage } from "./reconcile-message";
import type { RoomMessage } from "./repository";

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

describe("reconcileMessage", () => {
  it("appends a new message in time order", () => {
    const first = message({ id: "m1", clientId: "c1", createdAt: "2026-11-14T10:00:00.000Z" });
    const second = message({ id: "m2", clientId: "c2", createdAt: "2026-11-14T10:01:00.000Z" });
    expect(reconcileMessage([second], first).map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("replaces an optimistic copy that shares the clientId", () => {
    const sending = message({ id: "temp", clientId: "c1", delivery: "sending" });
    const persisted = message({ id: "m1", clientId: "c1", delivery: "persisted" });
    const result = reconcileMessage([sending], persisted);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "m1", delivery: "persisted" });
  });

  it("keeps resolved attachments when a realtime echo has none", () => {
    const attachment = { id: "a1" } as RoomMessage["attachments"][number];
    const existing = message({ attachments: [attachment] });
    const echo = message({ attachments: [] });
    expect(reconcileMessage([existing], echo)[0].attachments).toEqual([attachment]);
  });
});
