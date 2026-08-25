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

  it("folds every run of one chain into a single reply", () => {
    // A chain is one ask. Four bubbles for one request is the spam the batch
    // grouping already exists to prevent -- these runs are minutes apart with
    // different instructions, so only the chain id can tell they belong together.
    const grouped = groupDesignTurnsBySend([
      turn({ taskId: "t1", chainId: "c1", userPrompt: "design the full flow", createdAt: "2026-08-25T10:00:00Z" }),
      turn({ taskId: "t2", chainId: "c1", userPrompt: "build these screens for the flow: a, b", createdAt: "2026-08-25T10:06:00Z" }),
      turn({ taskId: "t3", chainId: "c1", userPrompt: "build these screens for the flow: c", createdAt: "2026-08-25T10:12:00Z" }),
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.taskIds).toEqual(["t1", "t2", "t3"]);
  });

  it("gathers a chain's links even when another generation lands between them", () => {
    // A chain's links are minutes apart, so anything else started in between
    // sits between them in creation order. Folding only neighbours split one
    // chain into several replies, and the later bubble counted only its own
    // links -- "Built 2 of 9", then "Built 1 of 9".
    const grouped = groupDesignTurnsBySend([
      turn({ taskId: "t1", chainId: "c1", userPrompt: "design the full flow", createdAt: "2026-08-25T10:00:00Z" }),
      turn({ taskId: "t2", chainId: "c1", userPrompt: "build these screens for the flow: a, b", createdAt: "2026-08-25T10:06:00Z" }),
      turn({ taskId: "interloper", chainId: null, userPrompt: "make the header blue", createdAt: "2026-08-25T10:07:00Z" }),
      turn({ taskId: "t3", chainId: "c1", userPrompt: "build these screens for the flow: c", createdAt: "2026-08-25T10:12:00Z" }),
    ]);
    expect(grouped).toHaveLength(2);
    // The chain stays where it began, with every link in it.
    expect(grouped[0]?.taskIds).toEqual(["t1", "t2", "t3"]);
    expect(grouped[1]?.taskIds).toEqual(["interloper"]);
  });

  it("does not fold two unchained sends that a chain link happened to separate", () => {
    // The consecutive-only rule for a fan-out has to survive the change: t1
    // and t3 are a minute apart with the same words but were NOT one send,
    // and pulling the chain link out from between them must not make them
    // look like one.
    const grouped = groupDesignTurnsBySend([
      turn({ taskId: "t1", chainId: null, userPrompt: "make it blue", createdAt: "2026-08-25T10:00:00Z" }),
      turn({ taskId: "t2", chainId: "c1", userPrompt: "design the full flow", createdAt: "2026-08-25T10:00:10Z" }),
      turn({ taskId: "t3", chainId: null, userPrompt: "make it blue", createdAt: "2026-08-25T10:00:20Z" }),
    ]);
    expect(grouped.map((group) => group.taskIds)).toEqual([
      ["t1"],
      ["t2"],
      ["t3"],
    ]);
  });

  it("keeps separate chains apart", () => {
    const grouped = groupDesignTurnsBySend([
      turn({ taskId: "t1", chainId: "c1", createdAt: "2026-08-25T10:00:00Z" }),
      turn({ taskId: "t2", chainId: "c2", createdAt: "2026-08-25T10:00:30Z" }),
    ]);
    expect(grouped).toHaveLength(2);
  });

  it("still folds a parallel fan-out that has no chain", () => {
    // The existing rule has to keep working: editing three selected screens
    // queues three tasks with the same prompt, seconds apart, and no chain id.
    const grouped = groupDesignTurnsBySend([
      turn({ taskId: "t1", chainId: null, userPrompt: "make it blue", createdAt: "2026-08-25T10:00:00Z" }),
      turn({ taskId: "t2", chainId: null, userPrompt: "make it blue", createdAt: "2026-08-25T10:00:01Z" }),
    ]);
    expect(grouped).toHaveLength(1);
  });

  it("never folds two turns that merely both lack a chain and differ", () => {
    const grouped = groupDesignTurnsBySend([
      turn({ taskId: "t1", chainId: null, userPrompt: "one", createdAt: "2026-08-25T10:00:00Z" }),
      turn({ taskId: "t2", chainId: null, userPrompt: "two", createdAt: "2026-08-25T10:00:01Z" }),
    ]);
    expect(grouped).toHaveLength(2);
  });
});
