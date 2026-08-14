import type { FlowDocument } from "@meld/contracts";
import { describe, expect, it } from "vitest";
import {
  downstreamActionSteps,
  formatOutgoingStepsForPrompt,
} from "./outgoing-steps";

function flow(
  nodes: FlowDocument["nodes"],
  edges: FlowDocument["edges"],
): FlowDocument {
  return { title: "T", summary: "S", nodes, edges, openQuestions: [] };
}

const start = { id: "start", kind: "start", label: "Start", detail: null } as const;
const login = { id: "login", kind: "action", label: "Login", detail: null } as const;
const home = { id: "home", kind: "action", label: "Home", detail: null } as const;
const error = { id: "error", kind: "action", label: "Error", detail: null } as const;
const done = { id: "done", kind: "end", label: "Done", detail: null } as const;

describe("downstreamActionSteps", () => {
  it("uses the edge label for a direct action->action edge", () => {
    const doc = flow(
      [start, login, home, done],
      [
        { id: "e0", from: "start", to: "login", label: null },
        { id: "e1", from: "login", to: "home", label: "Continue" },
        { id: "e2", from: "home", to: "done", label: null },
      ],
    );
    expect(downstreamActionSteps(doc, "login")).toEqual([
      { nodeId: "home", label: "Continue" },
    ]);
  });

  it("follows through a system node to the next action, using the node label", () => {
    const validate = { id: "validate", kind: "system", label: "Validate", detail: null } as const;
    const doc = flow(
      [start, login, validate, home, done],
      [
        { id: "e0", from: "start", to: "login", label: null },
        { id: "e1", from: "login", to: "validate", label: null },
        { id: "e2", from: "validate", to: "home", label: null },
        { id: "e3", from: "home", to: "done", label: null },
      ],
    );
    expect(downstreamActionSteps(doc, "login")).toEqual([
      { nodeId: "home", label: "Home" },
    ]);
  });

  it("fans out a decision into one step per branch, labelled by the branch edge", () => {
    const check = { id: "check", kind: "decision", label: "Valid?", detail: null } as const;
    const doc = flow(
      [start, login, check, home, error, done],
      [
        { id: "e0", from: "start", to: "login", label: null },
        { id: "e1", from: "login", to: "check", label: null },
        { id: "e2", from: "check", to: "home", label: "Valid" },
        { id: "e3", from: "check", to: "error", label: "Invalid" },
        { id: "e4", from: "home", to: "done", label: null },
        { id: "e5", from: "error", to: "done", label: null },
      ],
    );
    expect(downstreamActionSteps(doc, "login")).toEqual([
      { nodeId: "home", label: "Valid" },
      { nodeId: "error", label: "Invalid" },
    ]);
  });

  it("omits terminal ends (no screen behind them)", () => {
    const doc = flow(
      [start, login, done],
      [
        { id: "e0", from: "start", to: "login", label: null },
        { id: "e1", from: "login", to: "done", label: "Finish" },
      ],
    );
    expect(downstreamActionSteps(doc, "login")).toEqual([]);
  });

  it("dedupes an action reachable by two branches", () => {
    const check = { id: "check", kind: "decision", label: "Valid?", detail: null } as const;
    const doc = flow(
      [start, login, check, home, done],
      [
        { id: "e0", from: "start", to: "login", label: null },
        { id: "e1", from: "login", to: "check", label: null },
        { id: "e2", from: "check", to: "home", label: "A" },
        { id: "e3", from: "check", to: "home", label: "B" },
        { id: "e4", from: "home", to: "done", label: null },
      ],
    );
    expect(downstreamActionSteps(doc, "login")).toEqual([
      { nodeId: "home", label: "A" },
    ]);
  });

  it("terminates on a decision cycle without looping forever", () => {
    const check = { id: "check", kind: "decision", label: "Retry?", detail: null } as const;
    const doc = flow(
      [start, login, check, home, done],
      [
        { id: "e0", from: "start", to: "login", label: null },
        { id: "e1", from: "login", to: "check", label: null },
        { id: "e2", from: "check", to: "login", label: "Retry" },
        { id: "e3", from: "check", to: "home", label: "Done" },
        { id: "e4", from: "home", to: "done", label: null },
      ],
    );
    // login is the origin (guarded), so only `home` is offered.
    expect(downstreamActionSteps(doc, "login")).toEqual([
      { nodeId: "home", label: "Done" },
    ]);
  });

  it("returns nothing for an unknown node", () => {
    const doc = flow(
      [start, login, done],
      [{ id: "e0", from: "start", to: "login", label: null }],
    );
    expect(downstreamActionSteps(doc, "ghost")).toEqual([]);
  });
});

describe("formatOutgoingStepsForPrompt", () => {
  it("is empty when there are no steps", () => {
    expect(formatOutgoingStepsForPrompt([])).toBe("");
  });

  it("lists each step id and label", () => {
    const text = formatOutgoingStepsForPrompt([
      { nodeId: "home", label: "Continue" },
      { nodeId: "error", label: "Show error" },
    ]);
    expect(text).toContain("targetNodeId");
    expect(text).toContain("- home: Continue");
    expect(text).toContain("- error: Show error");
  });
});
