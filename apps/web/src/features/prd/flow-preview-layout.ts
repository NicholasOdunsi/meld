import type { FlowDocument, FlowNode, FlowNodeKind } from "@meld/contracts";

// A tiny layered layout for the read-only User-journeys preview. This is
// deliberately independent of the tldraw layout in features/canvas: the
// preview is a static thumbnail, not an editable canvas, so it needs positions
// and nothing else. Kept pure (no React, no DOM) so it can be unit-tested and
// rendered on the server.

export const FLOW_PREVIEW_NODE_WIDTH = 96;
export const FLOW_PREVIEW_NODE_HEIGHT = 40;
const COLUMN_GAP = 40;
const ROW_GAP = 16;
const PADDING = 12;

export type FlowPreviewNode = {
  id: string;
  kind: FlowNodeKind;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type FlowPreviewEdge = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type FlowPreviewLayout = {
  width: number;
  height: number;
  nodes: FlowPreviewNode[];
  edges: FlowPreviewEdge[];
};

// Shortest-path depth from the single start node. A visited set makes this safe
// on the decision cycles the flow schema permits: a back-edge never re-enqueues
// an already-placed node, so the walk always terminates. Any node the walk does
// not reach (the schema forbids it, but a coerced or hand-built document might)
// falls back to column 0 so it is still drawn rather than dropped.
function depthByNode(flow: FlowDocument): Map<string, number> {
  const adjacency = new Map<string, string[]>();
  for (const node of flow.nodes) adjacency.set(node.id, []);
  for (const edge of flow.edges) adjacency.get(edge.from)?.push(edge.to);

  const start =
    flow.nodes.find((node) => node.kind === "start") ?? flow.nodes[0];
  const depths = new Map<string, number>();
  if (!start) return depths;

  const queue: Array<{ id: string; depth: number }> = [
    { id: start.id, depth: 0 },
  ];
  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (depths.has(id)) continue;
    depths.set(id, depth);
    for (const next of adjacency.get(id) ?? []) {
      if (!depths.has(next)) queue.push({ id: next, depth: depth + 1 });
    }
  }
  return depths;
}

export function layoutFlowPreview(flow: FlowDocument): FlowPreviewLayout {
  const depths = depthByNode(flow);

  // Group nodes into columns by depth, preserving document order within a
  // column so the layout is stable for a given document.
  const columns = new Map<number, FlowNode[]>();
  for (const node of flow.nodes) {
    const depth = depths.get(node.id) ?? 0;
    const column = columns.get(depth);
    if (column) column.push(node);
    else columns.set(depth, [node]);
  }

  const positioned = new Map<string, FlowPreviewNode>();
  let maxColumn = 0;
  let maxRows = 0;
  for (const [depth, nodes] of columns) {
    maxColumn = Math.max(maxColumn, depth);
    maxRows = Math.max(maxRows, nodes.length);
    nodes.forEach((node, row) => {
      positioned.set(node.id, {
        id: node.id,
        kind: node.kind,
        label: node.label,
        x: PADDING + depth * (FLOW_PREVIEW_NODE_WIDTH + COLUMN_GAP),
        y: PADDING + row * (FLOW_PREVIEW_NODE_HEIGHT + ROW_GAP),
        width: FLOW_PREVIEW_NODE_WIDTH,
        height: FLOW_PREVIEW_NODE_HEIGHT,
      });
    });
  }

  const edges: FlowPreviewEdge[] = [];
  for (const edge of flow.edges) {
    const from = positioned.get(edge.from);
    const to = positioned.get(edge.to);
    if (!from || !to) continue;
    edges.push({
      id: edge.id,
      x1: from.x + from.width,
      y1: from.y + from.height / 2,
      x2: to.x,
      y2: to.y + to.height / 2,
    });
  }

  const width =
    PADDING * 2 +
    (maxColumn + 1) * FLOW_PREVIEW_NODE_WIDTH +
    maxColumn * COLUMN_GAP;
  const height =
    PADDING * 2 +
    maxRows * FLOW_PREVIEW_NODE_HEIGHT +
    Math.max(0, maxRows - 1) * ROW_GAP;

  return {
    width,
    height,
    nodes: [...positioned.values()],
    edges,
  };
}
