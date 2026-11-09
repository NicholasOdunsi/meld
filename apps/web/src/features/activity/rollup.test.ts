import { describe, expect, it } from "vitest";
import type { RoomActivity } from "@meld/contracts";
import { rollUpProjects } from "./rollup";

function room(overrides: Partial<RoomActivity>): RoomActivity {
  return {
    roomId: crypto.randomUUID(), projectId: "p1", roomName: "Tab",
    state: "idle", reason: null, taskKind: null, taskStatus: null, provider: null,
    proposalKind: null, proposalMessageId: null, occurredAt: null, lastActivityAt: null,
    ...overrides,
  };
}

describe("rollUpProjects", () => {
  it("working beats needs-you", () => {
    const working = room({ state: "working" });
    const map = rollUpProjects([room({ state: "needs_you", reason: "finished", occurredAt: "2026-11-09T10:00:00Z" }), working]);
    expect(map.get("p1")).toEqual({ projectId: "p1", state: "working", room: working });
  });
  it("needs-you picks the most recent reason", () => {
    const older = room({ state: "needs_you", reason: "stuck", occurredAt: "2026-11-09T09:00:00Z" });
    const newer = room({ state: "needs_you", reason: "asked", occurredAt: "2026-11-09T10:00:00Z" });
    expect(rollUpProjects([older, newer]).get("p1")?.room).toBe(newer);
  });
  it("all idle is idle with no room", () => {
    expect(rollUpProjects([room({}), room({})]).get("p1")).toEqual({ projectId: "p1", state: "idle", room: null });
  });
  it("keeps projects separate", () => {
    const map = rollUpProjects([room({ projectId: "a", state: "working" }), room({ projectId: "b" })]);
    expect(map.get("a")?.state).toBe("working");
    expect(map.get("b")?.state).toBe("idle");
  });
});
