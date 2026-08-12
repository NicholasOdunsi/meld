import {
  FlowDocumentSchema,
  type FlowDocument,
  type FlowEdge,
  type FlowNode,
} from "@meld/contracts";

// The reverse of flow-document-to-tldraw: read the structured flow back out of
// the canvas shapes so canvas edits can flow into the PRD's user-journey
// section. It relies on the `meta` the forward mapper stamps onto each shape
// (flowNodeId/flowNodeKind on nodes, flowEdgeId/from/to on arrows, flowRole on
// the title and question shapes). Shapes a user hand-draws carry none of that
// meta and are ignored -- a freeform drawing has no clean graph to extract.
//
// Kept pure: it takes already-extracted shape fields and a plaintext reader so
// it can be unit-tested without a live tldraw editor. The canvas passes
// `renderPlaintextFromRichText(editor, ...)` as the reader.

export type FlowShape = {
  type: string;
  meta?: Record<string, unknown> | null;
  richText?: unknown;
};

const NODE_KINDS = new Set(["start", "action", "system", "decision", "end"]);

function splitFirstLine(text: string): { first: string; rest: string } {
  const trimmed = text.replace(/\r\n/g, "\n");
  const newline = trimmed.indexOf("\n");
  if (newline === -1) return { first: trimmed.trim(), rest: "" };
  return {
    first: trimmed.slice(0, newline).trim(),
    rest: trimmed.slice(newline + 1).trim(),
  };
}

// Build a FlowDocument from canvas shapes, or null when the canvas does not
// hold a valid structured flow (no flow nodes, or the edited graph no longer
// satisfies the flow rules -- e.g. the start node was deleted). Returning null
// means "nothing safe to sync", so the last good journey is kept rather than
// overwritten with a broken one.
export function flowDocumentFromShapes(
  shapes: readonly FlowShape[],
  getText: (richText: unknown) => string,
): FlowDocument | null {
  let title = "";
  let summary = "";
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  const questions: Array<{ index: number; text: string }> = [];

  for (const shape of shapes) {
    const meta = shape.meta ?? {};
    const flowNodeId = meta.flowNodeId;
    const flowEdgeId = meta.flowEdgeId;
    const flowRole = meta.flowRole;

    if (shape.type === "geo" && typeof flowNodeId === "string") {
      const kind = meta.flowNodeKind;
      if (typeof kind !== "string" || !NODE_KINDS.has(kind)) continue;
      const { first, rest } = splitFirstLine(getText(shape.richText));
      nodes.push({
        id: flowNodeId,
        kind: kind as FlowNode["kind"],
        label: first || flowNodeId,
        detail: rest || null,
      });
    } else if (shape.type === "arrow" && typeof flowEdgeId === "string") {
      if (typeof meta.from !== "string" || typeof meta.to !== "string") continue;
      const label = getText(shape.richText).trim();
      edges.push({
        id: flowEdgeId,
        from: meta.from,
        to: meta.to,
        label: label || null,
      });
    } else if (shape.type === "text" && flowRole === "summary") {
      const { first, rest } = splitFirstLine(getText(shape.richText));
      title = first;
      summary = rest;
    } else if (shape.type === "note" && flowRole === "open-question") {
      const text = getText(shape.richText).replace(/^Open question\n?/i, "").trim();
      const index =
        typeof meta.questionIndex === "number"
          ? meta.questionIndex
          : questions.length;
      if (text) questions.push({ index, text });
    }
  }

  if (nodes.length === 0) return null;

  const resolvedTitle = title.trim() || "User journey";
  const candidate = {
    title: resolvedTitle,
    summary: summary.trim() || resolvedTitle,
    nodes,
    edges,
    openQuestions: questions
      .sort((left, right) => left.index - right.index)
      .map((question) => question.text),
  };

  const parsed = FlowDocumentSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
