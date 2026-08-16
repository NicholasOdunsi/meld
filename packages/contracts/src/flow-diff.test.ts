import { describe, expect, it } from "vitest";
import { diffFlowDocuments } from "./flow-diff";
import type { FlowDocument } from "./user-flow";

const base: FlowDocument = {
  title: "Signup",
  summary: "New user signs up",
  nodes: [
    { id: "start", kind: "start", label: "Start", detail: null },
    { id: "pay", kind: "action", label: "Pay", detail: "card" },
    { id: "finish", kind: "end", label: "Done", detail: null },
  ],
  edges: [
    { id: "e1", from: "start", to: "pay", label: null },
    { id: "e2", from: "pay", to: "finish", label: null },
  ],
  openQuestions: [],
};

describe("diffFlowDocuments", () => {
  it("reports no changes for identical documents", () => {
    const diff = diffFlowDocuments(base, base);
    expect(diff.isEmpty).toBe(true);
    expect(diff.nodesAdded).toEqual([]);
    expect(diff.nodesRelabeled).toEqual([]);
  });

  it("detects an added node and edge", () => {
    const next: FlowDocument = {
      ...base,
      nodes: [
        ...base.nodes,
        { id: "retry", kind: "action", label: "Retry", detail: null },
      ],
      edges: [
        ...base.edges,
        { id: "e3", from: "pay", to: "retry", label: "on failure" },
      ],
    };
    const diff = diffFlowDocuments(base, next);
    expect(diff.nodesAdded.map((n) => n.id)).toEqual(["retry"]);
    expect(diff.edgesAdded.map((e) => e.id)).toEqual(["e3"]);
    expect(diff.isEmpty).toBe(false);
  });

  it("detects a removed node", () => {
    const next: FlowDocument = {
      ...base,
      nodes: base.nodes.filter((n) => n.id !== "pay"),
      edges: [{ id: "e1", from: "start", to: "finish", label: null }],
    };
    const diff = diffFlowDocuments(base, next);
    expect(diff.nodesRemoved.map((n) => n.id)).toEqual(["pay"]);
    expect(diff.edgesRemoved.map((e) => e.id).sort()).toEqual(["e2"]);
  });

  it("detects a relabel (label or detail change) but not a stable node", () => {
    const next: FlowDocument = {
      ...base,
      nodes: base.nodes.map((n) =>
        n.id === "pay" ? { ...n, label: "Checkout", detail: "card or wallet" } : n,
      ),
    };
    const diff = diffFlowDocuments(base, next);
    expect(diff.nodesRelabeled.map((c) => c.id)).toEqual(["pay"]);
    expect(diff.nodesAdded).toEqual([]);
    expect(diff.nodesRemoved).toEqual([]);
  });
});
