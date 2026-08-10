import { describe, expect, it } from "vitest";
import { FlowDocumentSchema } from "@meld/contracts";
import { flowDocumentToTldrawRecords } from "./flow-document-to-tldraw";

const document = FlowDocumentSchema.parse({
  title: "Checkout",
  summary: "A buyer completes checkout.",
  nodes: [
    { id: "start", kind: "start", label: "Checkout started", detail: null },
    { id: "pay", kind: "action", label: "Enter payment", detail: null },
    { id: "valid", kind: "decision", label: "Payment valid?", detail: null },
    { id: "retry", kind: "system", label: "Show payment error", detail: null },
    { id: "done", kind: "end", label: "Order placed", detail: null },
  ],
  edges: [
    { id: "e1", from: "start", to: "pay", label: null },
    { id: "e2", from: "pay", to: "valid", label: null },
    { id: "e3", from: "valid", to: "done", label: "Yes" },
    { id: "e4", from: "valid", to: "retry", label: "No" },
  ],
  openQuestions: [],
});

describe("flowDocumentToTldrawRecords", () => {
  it("creates stable frame, node, and edge ids", () => {
    const first = flowDocumentToTldrawRecords({ taskId: "task-1", document, originX: 0, originY: 0 });
    const second = flowDocumentToTldrawRecords({ taskId: "task-1", document, originX: 0, originY: 0 });
    expect(first).toEqual(second);
    expect(first.records).toHaveLength(1 + document.nodes.length + document.edges.length);
    const shapes = first.records.filter((record): record is Extract<typeof record, { typeName: "shape" }> => record.typeName === "shape");
    expect(shapes.some((record) => record.type === "frame")).toBe(true);
    expect(shapes.filter((record) => record.type === "geo").map((record) => record.meta)).toEqual(
      expect.arrayContaining([expect.objectContaining({ flowNodeKind: "decision" })]),
    );
  });
});
