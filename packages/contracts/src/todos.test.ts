// packages/contracts/src/todos.test.ts
import { describe, expect, it } from "vitest";
import { MorningTodosOutputSchema, normalizeTodoText, TodoItemSchema } from "./todos";

describe("normalizeTodoText", () => {
  it("lowercases, drops punctuation and collapses spaces", () => {
    expect(normalizeTodoText("  Update the USER flow!!  for sign-up. ")).toBe("update the user flow for signup");
  });
  it("keeps non-English letters and digits", () => {
    expect(normalizeTodoText("Écrire 2 pages")).toBe("écrire 2 pages");
  });
});

describe("TodoItemSchema", () => {
  it("accepts a saved line", () => {
    const item = TodoItemSchema.parse({
      id: "b8000000-0000-4000-8000-000000000001",
      projectId: null,
      text: "Write the launch email",
      stage: "in_progress",
      position: 1,
      createdAt: "2026-11-09T06:00:00Z",
    });
    expect(item.text).toBe("Write the launch email");
    expect(item.stage).toBe("in_progress");
  });
});

describe("MorningTodosOutputSchema", () => {
  it("accepts summary + todos", () => {
    expect(MorningTodosOutputSchema.parse({ summary: "s", todos: ["a"] }).todos).toEqual(["a"]);
  });
  it("defaults missing todos to an empty list", () => {
    expect(MorningTodosOutputSchema.parse({ summary: "s" }).todos).toEqual([]);
  });
  it("rejects a non-string todo", () => {
    expect(() => MorningTodosOutputSchema.parse({ summary: "s", todos: [1] })).toThrow();
  });
});
