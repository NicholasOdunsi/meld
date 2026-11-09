import { describe, expect, it, vi } from "vitest";
import type { TodoWriter } from "./deepseek-todo-writer";
import { TodoWriterError } from "./deepseek-todo-writer";
import { runMorningTodos, type MorningRepository } from "./run-morning-todos";
import type { ProjectFacts } from "./facts";

const SIX_THIRTY_LONDON = new Date("2026-11-10T06:30:00Z");

function facts(id: string, known: string[] = []): ProjectFacts {
  return {
    projectId: id, projectName: id, summary: "", since: "2026-11-09T06:00:00Z", activityCount: 1,
    facts: { messages: [], decisions: [], prds: [], screens: [], tasks: [], open_todos: known, known_todos: known },
  };
}

function repo(overrides: Partial<MorningRepository> = {}): MorningRepository {
  return {
    listWorkspaces: vi.fn().mockResolvedValue([{ workspaceId: "w1", ownerUserId: "u1", timeZone: null }]),
    claim: vi.fn().mockResolvedValue(true),
    facts: vi.fn().mockResolvedValue([facts("p1", ["Pick a login style"]), facts("p2")]),
    save: vi.fn().mockImplementation(async (_w, _p, _s, todos: string[]) => todos.length),
    finish: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const writer = (out: Record<string, { summary: string; todos: string[] } | Error>): TodoWriter => ({
  model: "m",
  write: vi.fn(async (brief: string) => {
    const key = brief.match(/^Project: (\S+)/)?.[1] ?? "";
    const value = out[key];
    if (value instanceof Error) throw value;
    return value;
  }),
});

describe("runMorningTodos", () => {
  it("skips outside 6–9 local", async () => {
    const repository = repo();
    const report = await runMorningTodos({ repository, writer: writer({}), now: new Date("2026-11-10T12:00:00Z") });
    expect(report).toEqual([{ workspaceId: "w1", status: "skipped", projectsRead: 0, itemsAdded: 0 }]);
    expect(repository.claim).not.toHaveBeenCalled();
  });

  it("skips when the day is already claimed", async () => {
    const repository = repo({ claim: vi.fn().mockResolvedValue(false) });
    const report = await runMorningTodos({ repository, writer: writer({}), now: SIX_THIRTY_LONDON });
    expect(report[0].status).toBe("skipped");
    expect(repository.facts).not.toHaveBeenCalled();
  });

  it("writes filtered to-dos per project and finishes done", async () => {
    const repository = repo();
    const report = await runMorningTodos({
      repository, now: SIX_THIRTY_LONDON,
      writer: writer({ p1: { summary: "S1", todos: ["Pick a login style.", "Draft pricing"] }, p2: { summary: "S2", todos: [] } }),
    });
    expect(repository.claim).toHaveBeenCalledWith("w1", "2026-11-10");
    expect(repository.facts).toHaveBeenCalledWith("w1", "u1", 10);
    expect(repository.save).toHaveBeenCalledWith("w1", "p1", "S1", ["Draft pricing"], SIX_THIRTY_LONDON.toISOString());
    expect(repository.save).toHaveBeenCalledWith("w1", "p2", "S2", [], SIX_THIRTY_LONDON.toISOString());
    expect(repository.finish).toHaveBeenCalledWith("w1", "2026-11-10", "done", 2, 1);
    expect(report[0]).toEqual({ workspaceId: "w1", status: "done", projectsRead: 2, itemsAdded: 1 });
  });

  it("keeps going when one project fails and never logs content", async () => {
    const repository = repo();
    const log = vi.fn();
    await runMorningTodos({
      repository, now: SIX_THIRTY_LONDON, log,
      writer: writer({ p1: new TodoWriterError("http"), p2: { summary: "S2", todos: ["Ship it"] } }),
    });
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(repository.finish).toHaveBeenCalledWith("w1", "2026-11-10", "done", 1, 1);
    expect(log).toHaveBeenCalledWith("morning to-dos: project failed", { workspaceId: "w1", projectId: "p1", code: "http" });
  });

  it("marks the run failed when every project fails", async () => {
    const repository = repo();
    await runMorningTodos({
      repository, now: SIX_THIRTY_LONDON,
      writer: writer({ p1: new TodoWriterError("http"), p2: new TodoWriterError("timeout") }),
    });
    expect(repository.finish).toHaveBeenCalledWith("w1", "2026-11-10", "failed", 0, 0);
  });

  it("force ignores the window", async () => {
    const repository = repo();
    const report = await runMorningTodos({ repository, writer: writer({ p1: { summary: "", todos: [] }, p2: { summary: "", todos: [] } }), now: new Date("2026-11-10T15:00:00Z"), force: true });
    expect(report[0].status).toBe("done");
  });
});
