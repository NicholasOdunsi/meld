import { describe, expect, it } from "vitest";
import { filterNewTodos, renderFacts, type ProjectFacts } from "./facts";

function project(messages: number): ProjectFacts {
  return {
    projectId: "p1", projectName: "Mark", summary: "Onboarding in progress.",
    since: "2026-11-09T06:00:00Z", activityCount: messages,
    facts: {
      messages: Array.from({ length: messages }, (_, i) => ({
        room: "Main", from: "you" as const, text: `message ${i} ` + "word ".repeat(100), at: `2026-11-09T${String(10 + (i % 10)).padStart(2, "0")}:00:00Z`,
      })),
      decisions: [{ room: "Main", summary: "Use magic links", at: "2026-11-09T09:00:00Z" }],
      prds: [], screens: [], tasks: [{ room: "Main", kind: "prd_generate", status: "failed", at: "2026-11-09T08:00:00Z" }],
      open_todos: ["Pick a login style"], known_todos: ["Pick a login style"],
    },
  };
}

describe("renderFacts", () => {
  it("includes the summary, decisions, tasks and open to-dos", () => {
    const text = renderFacts(project(2));
    expect(text).toContain("Onboarding in progress.");
    expect(text).toContain("Use magic links");
    expect(text).toContain("prd_generate");
    expect(text).toContain("Pick a login style");
  });
  it("cuts the oldest messages to stay under the word budget", () => {
    const text = renderFacts(project(200), 2000);
    expect(text.split(/\s+/).length).toBeLessThanOrEqual(2000);
    expect(text).toContain("message 0 ");
    expect(text).not.toContain("message 199 ");
  });
});

describe("filterNewTodos", () => {
  it("drops known, duplicate and blank to-dos and caps at 5", () => {
    const out = filterNewTodos(
      ["Pick a login style!", "Draft pricing", "draft  pricing", " ", "A", "B", "C", "D", "E"],
      ["pick a login style"],
    );
    expect(out).toEqual(["Draft pricing", "A", "B", "C", "D"]);
  });
  it("trims and drops over-long lines", () => {
    expect(filterNewTodos(["  Ship it  ", "x".repeat(501)], [])).toEqual(["Ship it"]);
  });
});
