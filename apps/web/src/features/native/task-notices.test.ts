import { describe, expect, it } from "vitest";
import type { RoomTaskStatus } from "@/features/ai/room-task-status";
import { taskCompletionNotices } from "./task-notices";

function task(taskId: string, kind: RoomTaskStatus["kind"], status: RoomTaskStatus["status"]): RoomTaskStatus {
  return {
    taskId, kind, status,
    sourceMessageId: null, initiatingUserId: "u", provider: "claude", agentKind: "product",
    createdAt: "2026-11-08T00:00:00Z", updatedAt: "2026-11-08T00:00:00Z",
  };
}

describe("taskCompletionNotices", () => {
  it("says nothing on the first read (baseline)", () => {
    expect(taskCompletionNotices(null, [task("a", "room_reply", "completed")], "Home")).toEqual([]);
  });

  it("announces a reply that finished since the last read", () => {
    const previous = new Map([["a", "running" as const]]);
    expect(taskCompletionNotices(previous, [task("a", "room_reply", "completed")], "Home")).toEqual([
      { title: "Orion replied", body: "In Home" },
    ]);
  });

  it("announces screens and user flows", () => {
    const previous = new Map([["s", "queued" as const], ["f", "running" as const]]);
    const notices = taskCompletionNotices(
      previous,
      [task("s", "design_screen_generate", "completed"), task("f", "user_flow_generate", "completed")],
      "Home",
    );
    expect(notices).toEqual([
      { title: "Screens ready", body: "New screens in Home" },
      { title: "User flow ready", body: "In Home" },
    ]);
  });

  it("ignores failures, other kinds, and tasks first seen already completed", () => {
    const previous = new Map([["a", "running" as const], ["p", "running" as const]]);
    expect(
      taskCompletionNotices(
        previous,
        [task("a", "room_reply", "failed"), task("p", "prd_generate", "completed"), task("new", "room_reply", "completed")],
        "Home",
      ),
    ).toEqual([]);
  });

  it("uses a neutral body when the room name is unknown", () => {
    const previous = new Map([["a", "running" as const]]);
    expect(taskCompletionNotices(previous, [task("a", "room_reply", "completed")], undefined)).toEqual([
      { title: "Orion replied", body: "In your room" },
    ]);
  });
});
