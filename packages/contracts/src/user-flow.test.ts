import { describe, expect, it } from "vitest";
import {
  FlowDocumentSchema,
  MAX_FLOW_DETAIL_CHARS,
  MAX_FLOW_EDGES,
  MAX_FLOW_NODES,
  MAX_FLOW_OPEN_QUESTIONS,
} from "./user-flow";

const validDocument = () => ({
  title: "Ownership transfer",
  summary: "An owner transfers a workspace.",
  nodes: [
    { id: "start", kind: "start", label: "Transfer requested", detail: null },
    { id: "eligible", kind: "decision", label: "Recipient eligible?", detail: null },
    { id: "done", kind: "end", label: "Ownership transferred", detail: null },
  ],
  edges: [
    { id: "e1", from: "start", to: "eligible", label: null },
    { id: "e2", from: "eligible", to: "done", label: "Yes" },
  ],
  openQuestions: [],
});

describe("FlowDocumentSchema", () => {
  it("accepts a bounded start, decision, and end graph", () => {
    expect(FlowDocumentSchema.parse(validDocument()).nodes).toHaveLength(3);
  });

  it("rejects duplicate ids and invalid edge endpoints", () => {
    expect(() =>
      FlowDocumentSchema.parse({
        ...validDocument(),
        nodes: [
          ...validDocument().nodes,
          { id: "done", kind: "action", label: "Duplicate", detail: null },
        ],
      }),
    ).toThrow("Duplicate flow node id");
    expect(() =>
      FlowDocumentSchema.parse({
        ...validDocument(),
        edges: [{ id: "e1", from: "missing", to: "done", label: null }],
      }),
    ).toThrow("unknown source");
  });

  it("requires exactly one start and at least one end", () => {
    expect(() =>
      FlowDocumentSchema.parse({
        ...validDocument(),
        nodes: validDocument().nodes.map((node) =>
          node.kind === "start" ? { ...node, kind: "action" } : node,
        ),
      }),
    ).toThrow("exactly one start");
    expect(() =>
      FlowDocumentSchema.parse({
        ...validDocument(),
        nodes: validDocument().nodes.filter((node) => node.kind !== "end"),
        edges: [{ id: "e1", from: "start", to: "eligible", label: null }],
      }),
    ).toThrow("at least one end");
  });

  it("allows a decision-controlled cycle and rejects an unconditional cycle", () => {
    expect(
      FlowDocumentSchema.parse({
        ...validDocument(),
        edges: [
          { id: "e1", from: "start", to: "eligible", label: null },
          { id: "e2", from: "eligible", to: "start", label: "No" },
          { id: "e3", from: "eligible", to: "done", label: "Yes" },
        ],
      }),
    ).toBeTruthy();
    expect(() =>
      FlowDocumentSchema.parse({
        ...validDocument(),
        nodes: [
          { id: "start", kind: "start", label: "Start", detail: null },
          { id: "action", kind: "action", label: "Repeat", detail: null },
          { id: "done", kind: "end", label: "Done", detail: null },
        ],
        edges: [
          { id: "e1", from: "start", to: "action", label: null },
          { id: "e2", from: "action", to: "start", label: "Again" },
          { id: "e3", from: "action", to: "done", label: "Stop" },
        ],
      }),
    ).toThrow("Cycles are only allowed");
  });

  it("enforces node, edge, question, and detail limits", () => {
    const document = validDocument();
    expect(() =>
      FlowDocumentSchema.parse({
        ...document,
        nodes: Array.from({ length: MAX_FLOW_NODES + 1 }, (_, index) => ({
          id: `node-${index}`,
          kind: index === 0 ? "start" : index === MAX_FLOW_NODES ? "end" : "action",
          label: "Node",
          detail: null,
        })),
      }),
    ).toThrow();
    expect(() =>
      FlowDocumentSchema.parse({
        ...document,
        openQuestions: Array.from({ length: MAX_FLOW_OPEN_QUESTIONS + 1 }, () => "Question"),
      }),
    ).toThrow();
    expect(() =>
      FlowDocumentSchema.parse({
        ...document,
        nodes: document.nodes.map((node) =>
          node.id === "start" ? { ...node, detail: "x".repeat(MAX_FLOW_DETAIL_CHARS + 1) } : node,
        ),
      }),
    ).toThrow();
    expect(MAX_FLOW_EDGES).toBe(80);
  });
});
