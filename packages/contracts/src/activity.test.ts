import { describe, expect, it } from "vitest";
import { RoomActivitySchema } from "./activity";

const base = {
  roomId: "a4000000-0000-4000-8000-000000000001",
  projectId: "a7000000-0000-4000-8000-000000000001",
  roomName: "Inbox screen",
  state: "needs_you",
  reason: "finished",
  taskKind: "design_screen_generate",
  taskStatus: "completed",
  provider: "claude",
  proposalKind: null,
  proposalMessageId: null,
  occurredAt: "2026-11-09T10:00:00+00:00",
  lastActivityAt: "2026-11-09T10:00:00+00:00",
};

describe("RoomActivitySchema", () => {
  it("accepts a finished room", () => {
    expect(RoomActivitySchema.parse(base).reason).toBe("finished");
  });
  it("accepts an idle room with no task", () => {
    const idle = { ...base, state: "idle", reason: null, taskKind: null, taskStatus: null, provider: null, occurredAt: null, lastActivityAt: null };
    expect(RoomActivitySchema.parse(idle).state).toBe("idle");
  });
  it("rejects an unknown state", () => {
    expect(() => RoomActivitySchema.parse({ ...base, state: "busy" })).toThrow();
  });
});
