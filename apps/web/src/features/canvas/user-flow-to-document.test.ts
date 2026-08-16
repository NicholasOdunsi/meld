import { describe, expect, it } from "vitest";
import { flowDocumentFromShapes, type FlowShape } from "./user-flow-to-document";

const getText = (richText: unknown) => String(richText ?? "");

const titleShape: FlowShape = {
  type: "text",
  meta: { flowRole: "summary" },
  richText: "My Journey\nA short summary.",
};
const startNode: FlowShape = {
  type: "geo",
  meta: { flowNodeId: "start", flowNodeKind: "start" },
  richText: "Open cart",
};
const endNode: FlowShape = {
  type: "geo",
  meta: { flowNodeId: "done", flowNodeKind: "end" },
  richText: "Done\nfinal detail line",
};
const edge: FlowShape = {
  type: "arrow",
  meta: { flowEdgeId: "e1", from: "start", to: "done" },
  richText: "proceed",
};
const question: FlowShape = {
  type: "note",
  meta: { flowRole: "open-question", questionIndex: 0 },
  richText: "Open question\nWhat about guests?",
};
const handDrawn: FlowShape = { type: "geo", meta: {}, richText: "doodle" };

describe("flowDocumentFromShapes", () => {
  it("reconstructs a flow document from flow-tagged shapes", () => {
    const flow = flowDocumentFromShapes(
      [titleShape, startNode, edge, endNode, question, handDrawn],
      getText,
    );

    expect(flow).not.toBeNull();
    expect(flow?.title).toBe("My Journey");
    expect(flow?.summary).toBe("A short summary.");
    expect(flow?.nodes).toEqual([
      { id: "start", kind: "start", label: "Open cart", detail: null },
      { id: "done", kind: "end", label: "Done", detail: "final detail line" },
    ]);
    expect(flow?.edges).toEqual([
      { id: "e1", from: "start", to: "done", label: "proceed" },
    ]);
    expect(flow?.openQuestions).toEqual(["What about guests?"]);
  });

  it("ignores hand-drawn shapes that carry no flow metadata", () => {
    const flow = flowDocumentFromShapes(
      [titleShape, startNode, edge, endNode, handDrawn],
      getText,
    );
    // Only the two tagged nodes survive; the doodle is dropped.
    expect(flow?.nodes.map((node) => node.id)).toEqual(["start", "done"]);
  });

  it("returns null when there are no flow nodes", () => {
    expect(flowDocumentFromShapes([handDrawn], getText)).toBeNull();
  });

  it("returns null when the edited graph is no longer a valid flow", () => {
    // Start node deleted -> the flow schema (exactly one start) rejects it, so
    // we keep the last good journey instead of syncing a broken one.
    const flow = flowDocumentFromShapes([titleShape, endNode], getText);
    expect(flow).toBeNull();
  });

  it("treats an empty edge label as no label", () => {
    const flow = flowDocumentFromShapes(
      [startNode, { ...edge, richText: "  " }, endNode],
      getText,
    );
    expect(flow?.edges[0]?.label).toBeNull();
  });
});
