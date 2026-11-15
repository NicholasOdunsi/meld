import { describe, expect, it } from "vitest";
import type { RoomTaskStatus } from "@/features/ai/room-task-status";
import type { StreamScreen } from "./bridge";
import { deriveActivity } from "./stream-activity";

function task(overrides: Partial<RoomTaskStatus>): RoomTaskStatus {
  return {
    taskId: "t1", sourceMessageId: "m1", initiatingUserId: "u1", provider: "codex",
    kind: "room_reply", agentKind: "product", status: "queued",
    createdAt: "2026-11-15T10:00:00.000Z", updatedAt: "2026-11-15T10:00:00.000Z",
    ...overrides,
  };
}
const noStars: { id: string; followupMessageIds: string[] }[] = [];
const noScreens: StreamScreen[] = [];

describe("deriveActivity", () => {
  it("maps queued, running and offline room replies", () => {
    expect(deriveActivity([task({ status: "queued" })], noStars, noScreens)[0].phase).toBe("reading");
    expect(deriveActivity([task({ status: "running" })], noStars, noScreens)[0].phase).toBe("replying");
    expect(deriveActivity([task({ status: "waiting_for_device" })], noStars, noScreens)[0].phase).toBe("offline");
  });

  it("maps design tasks to designing with the building screen's name", () => {
    const building: StreamScreen = {
      id: "s1", name: "Balance", state: "building", versionId: null, formFactor: "mobile",
      createdAt: "2026-11-15T10:00:00.000Z", updating: false,
    };
    const [activity] = deriveActivity([task({ kind: "design_screen_generate", status: "running" })], noStars, [building]);
    expect(activity).toMatchObject({ phase: "designing", screenName: "Balance" });
  });

  it("maps sign-in, limit and failure, but only the latest failure", () => {
    expect(deriveActivity([task({ status: "needs_reauthentication" })], noStars, noScreens)[0].phase).toBe("needs_signin");
    expect(deriveActivity([task({ status: "usage_limit_reached" })], noStars, noScreens)[0].phase).toBe("limit_reached");
    const older = task({ taskId: "old", status: "failed", createdAt: "2026-11-15T09:00:00.000Z" });
    const latest = task({ taskId: "new", status: "failed", createdAt: "2026-11-15T10:00:00.000Z" });
    expect(deriveActivity([older, latest], noStars, noScreens).map((a) => a.taskId)).toEqual(["new"]);
  });

  it("ignores finished tasks and files follow-up tasks under their Star", () => {
    expect(deriveActivity([task({ status: "completed" })], noStars, noScreens)).toEqual([]);
    const stars = [{ id: "star1", followupMessageIds: ["m2"] }];
    const [activity] = deriveActivity([task({ taskId: "t2", sourceMessageId: "m2", status: "running" })], stars, noScreens);
    expect(activity.starId).toBe("star1");
  });
});
