import { describe, expect, it } from "vitest";
import type { DesignAgentTurn } from "./design-agent-transcript";
import { groupDesignTurnsBySend } from "./group-design-turns";

const turn = (overrides: Partial<DesignAgentTurn>): DesignAgentTurn => ({
  taskId: "task-1",
  screenId: "screen-1",
  screenName: "Explore",
  screens: [{ id: "screen-1", name: "Explore", state: "built", currentVersionId: "v1" }],
  userPrompt: "update button colors",
  initiatedBy: "user-1",
  taskStatus: "completed",
  screenState: "built",
  currentVersionId: "v1",
  createdAt: "2026-08-23T14:57:46.000Z",
  editedExisting: false,
  chainId: null,
  chainTotal: 0,
  ...overrides,
});

describe("groupDesignTurnsBySend", () => {
  // Editing five selected screens queues five tasks. Rendered one per task,
  // the same prompt appeared five times with five replies -- one request
  // reading as spam.
  it("folds one send's tasks into a single turn", () => {
    const grouped = groupDesignTurnsBySend([
      turn({ taskId: "t1", screenId: "s1", screens: [{ id: "s1", name: "Explore", state: "built", currentVersionId: "v1" }], createdAt: "2026-08-23T14:57:46.000Z" }),
      turn({ taskId: "t2", screenId: "s2", screens: [{ id: "s2", name: "Bodija", state: "built", currentVersionId: "v2" }], createdAt: "2026-08-23T14:57:47.000Z" }),
      turn({ taskId: "t3", screenId: "s3", screens: [{ id: "s3", name: "Detail", state: "built", currentVersionId: "v3" }], createdAt: "2026-08-23T14:57:48.000Z" }),
    ]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].screens.map((s) => s.name)).toEqual([
      "Explore",
      "Bodija",
      "Detail",
    ]);
    // Every task in the group, so a stop reaches all of them.
    expect(grouped[0].taskIds).toEqual(["t1", "t2", "t3"]);
  });

  it("keeps genuinely separate asks apart", () => {
    const grouped = groupDesignTurnsBySend([
      turn({ taskId: "t1", userPrompt: "make it green" }),
      turn({ taskId: "t2", userPrompt: "now add a filter bar", createdAt: "2026-08-23T14:57:47.000Z" }),
    ]);
    expect(grouped).toHaveLength(2);
  });

  it("keeps the same words asked again later apart", () => {
    // Same prompt, but minutes later -- a deliberate re-run, not one send.
    const grouped = groupDesignTurnsBySend([
      turn({ taskId: "t1", createdAt: "2026-08-23T14:57:46.000Z" }),
      turn({ taskId: "t2", createdAt: "2026-08-23T15:20:00.000Z" }),
    ]);
    expect(grouped).toHaveLength(2);
  });

  it("keeps different people's asks apart even if the words match", () => {
    const grouped = groupDesignTurnsBySend([
      turn({ taskId: "t1", initiatedBy: "user-1" }),
      turn({ taskId: "t2", initiatedBy: "user-2", createdAt: "2026-08-23T14:57:47.000Z" }),
    ]);
    expect(grouped).toHaveLength(2);
  });

  it("is still running while any task in the group is", () => {
    const grouped = groupDesignTurnsBySend([
      turn({ taskId: "t1", taskStatus: "completed" }),
      turn({ taskId: "t2", taskStatus: "running", createdAt: "2026-08-23T14:57:47.000Z" }),
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].taskStatus).toBe("running");
  });
});
