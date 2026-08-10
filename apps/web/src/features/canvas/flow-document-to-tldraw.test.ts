import { describe, expect, it } from "vitest";
import { FlowDocumentSchema } from "@meld/contracts";
import { createTLStore } from "tldraw";
import {
  findGeneratedFlowOrigin,
  flowDocumentToTldrawRecords,
} from "./flow-document-to-tldraw";

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
  openQuestions: ["What happens after the final failed retry?"],
});

describe("flowDocumentToTldrawRecords", () => {
  it("creates stable frame, node, and edge ids", () => {
    const input = {
      taskId: "task-1",
      document,
      originX: 0,
      originY: 0,
      createdAt: "2026-08-10T12:00:00.000Z",
    };
    const first = flowDocumentToTldrawRecords(input);
    const second = flowDocumentToTldrawRecords(input);
    expect(first).toEqual(second);
    expect(first.records).toHaveLength(
      3 + document.nodes.length + document.edges.length * 3 + document.openQuestions.length,
    );
    const shapes = first.records.filter((record): record is Extract<typeof record, { typeName: "shape" }> => record.typeName === "shape");
    expect(shapes.some((record) => record.type === "frame")).toBe(true);
    expect(shapes.filter((record) => record.type === "geo").map((record) => record.meta)).toEqual(
      expect.arrayContaining([expect.objectContaining({ flowNodeKind: "decision" })]),
    );
    expect(shapes.filter((record) => record.type === "arrow")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ parentId: first.frameId }),
      ]),
    );
    expect(first.records.filter((record) => record.typeName === "binding")).toHaveLength(
      document.edges.length * 2,
    );
    expect(shapes.filter((record) => record.type === "note")).toHaveLength(1);
    expect(shapes.map((record) => record.meta)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ flowRole: "provenance" }),
        expect.objectContaining({ flowRole: "open-question" }),
      ]),
    );
  });

  it("grows node shapes to keep bounded detail readable", () => {
    const detailed = FlowDocumentSchema.parse({
      ...document,
      nodes: document.nodes.map((node) =>
        node.id === "pay" ? { ...node, detail: "x".repeat(400) } : node,
      ),
    });
    const mapped = flowDocumentToTldrawRecords({
      taskId: "task-2",
      document: detailed,
      originX: 0,
      originY: 0,
    });
    const payment = mapped.records.find(
      (record) => record.typeName === "shape" && record.meta.flowNodeId === "pay",
    );
    expect(payment?.typeName === "shape" && payment.type === "geo" && payment.props.h).toBeGreaterThan(100);
  });

  it("creates records accepted by the real tldraw store schema", () => {
    const mapped = flowDocumentToTldrawRecords({
      taskId: "task-schema",
      document,
      originX: 0,
      originY: 0,
    });
    const store = createTLStore();
    expect(() => store.put(mapped.records)).not.toThrow();
    expect(store.allRecords()).toEqual(
      expect.arrayContaining(mapped.records),
    );
  });

  it("places the next frame to the right of existing page content", () => {
    const editor = {
      getCurrentPageBounds: () => ({ x: 50, y: 80, w: 900, h: 500 }),
    };
    expect(findGeneratedFlowOrigin(editor as never)).toEqual({ x: 1110, y: 80 });
  });
});
