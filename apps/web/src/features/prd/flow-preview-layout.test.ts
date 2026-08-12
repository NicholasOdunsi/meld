import type { FlowDocument } from "@meld/contracts";
import { describe, expect, it } from "vitest";
import {
  FLOW_PREVIEW_NODE_HEIGHT,
  FLOW_PREVIEW_NODE_WIDTH,
  layoutFlowPreview,
} from "./flow-preview-layout";

const linear: FlowDocument = {
  title: "Linear",
  summary: "A → B → C",
  nodes: [
    { id: "start", kind: "start", label: "Start", detail: null },
    { id: "middle", kind: "action", label: "Middle", detail: null },
    { id: "end", kind: "end", label: "End", detail: null },
  ],
  edges: [
    { id: "e1", from: "start", to: "middle", label: null },
    { id: "e2", from: "middle", to: "end", label: null },
  ],
  openQuestions: [],
};

describe("layoutFlowPreview", () => {
  it("places nodes in left-to-right columns by depth from the start", () => {
    const layout = layoutFlowPreview(linear);
    const byId = new Map(layout.nodes.map((node) => [node.id, node]));

    // Same row (a single chain), increasing columns.
    expect(byId.get("start")!.x).toBeLessThan(byId.get("middle")!.x);
    expect(byId.get("middle")!.x).toBeLessThan(byId.get("end")!.x);
    expect(byId.get("start")!.y).toBe(byId.get("end")!.y);
    expect(layout.width).toBeGreaterThan(FLOW_PREVIEW_NODE_WIDTH * 2);
  });

  it("draws each edge from the source's right side to the target's left side", () => {
    const layout = layoutFlowPreview(linear);
    const byId = new Map(layout.nodes.map((node) => [node.id, node]));
    const edge = layout.edges.find((candidate) => candidate.id === "e1")!;

    expect(edge.x1).toBe(byId.get("start")!.x + FLOW_PREVIEW_NODE_WIDTH);
    expect(edge.x2).toBe(byId.get("middle")!.x);
    expect(edge.y1).toBe(byId.get("start")!.y + FLOW_PREVIEW_NODE_HEIGHT / 2);
  });

  it("stacks nodes that share a depth into separate rows", () => {
    const branching: FlowDocument = {
      title: "Branch",
      summary: "start fans out to two actions",
      nodes: [
        { id: "start", kind: "start", label: "Start", detail: null },
        { id: "a", kind: "action", label: "A", detail: null },
        { id: "b", kind: "action", label: "B", detail: null },
        { id: "end", kind: "end", label: "End", detail: null },
      ],
      edges: [
        { id: "e1", from: "start", to: "a", label: null },
        { id: "e2", from: "start", to: "b", label: null },
        { id: "e3", from: "a", to: "end", label: null },
        { id: "e4", from: "b", to: "end", label: null },
      ],
      openQuestions: [],
    };
    const layout = layoutFlowPreview(branching);
    const byId = new Map(layout.nodes.map((node) => [node.id, node]));

    // a and b share the start's out-depth, so they sit in the same column but
    // different rows.
    expect(byId.get("a")!.x).toBe(byId.get("b")!.x);
    expect(byId.get("a")!.y).not.toBe(byId.get("b")!.y);
  });

  it("terminates and places every node on a decision cycle", () => {
    // The flow schema permits a cycle when it contains a decision node; the
    // shortest-path walk must not loop forever on the back-edge.
    const cyclic: FlowDocument = {
      title: "Retry",
      summary: "a decision loops back before ending",
      nodes: [
        { id: "start", kind: "start", label: "Start", detail: null },
        { id: "check", kind: "decision", label: "Valid?", detail: null },
        { id: "fix", kind: "action", label: "Fix", detail: null },
        { id: "end", kind: "end", label: "End", detail: null },
      ],
      edges: [
        { id: "e1", from: "start", to: "check", label: null },
        { id: "e2", from: "check", to: "fix", label: "no" },
        { id: "e3", from: "fix", to: "check", label: null },
        { id: "e4", from: "check", to: "end", label: "yes" },
      ],
      openQuestions: [],
    };
    const layout = layoutFlowPreview(cyclic);

    expect(layout.nodes).toHaveLength(4);
    expect(layout.edges).toHaveLength(4);
  });
});
