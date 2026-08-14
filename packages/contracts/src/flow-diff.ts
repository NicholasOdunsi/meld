import type { FlowDocument, FlowEdge, FlowNode } from "./user-flow";

export type FlowNodeChange = { id: string; before: FlowNode; after: FlowNode };

export type FlowDiff = {
  nodesAdded: FlowNode[];
  nodesRemoved: FlowNode[];
  nodesRelabeled: FlowNodeChange[];
  edgesAdded: FlowEdge[];
  edgesRemoved: FlowEdge[];
  isEmpty: boolean;
};

function nodeChanged(before: FlowNode, after: FlowNode): boolean {
  return (
    before.label !== after.label ||
    before.detail !== after.detail ||
    before.kind !== after.kind
  );
}

/**
 * Structural diff between two flows, keyed by node/edge id. The apply path uses
 * this to commit only what changed onto the live canvas rather than replacing
 * the frame, so manual layout and concurrent edits survive.
 */
export function diffFlowDocuments(base: FlowDocument, next: FlowDocument): FlowDiff {
  const baseNodes = new Map(base.nodes.map((node) => [node.id, node]));
  const nextNodes = new Map(next.nodes.map((node) => [node.id, node]));
  const baseEdges = new Map(base.edges.map((edge) => [edge.id, edge]));
  const nextEdges = new Map(next.edges.map((edge) => [edge.id, edge]));

  const nodesAdded: FlowNode[] = [];
  const nodesRelabeled: FlowNodeChange[] = [];
  for (const node of next.nodes) {
    const before = baseNodes.get(node.id);
    if (!before) nodesAdded.push(node);
    else if (nodeChanged(before, node)) {
      nodesRelabeled.push({ id: node.id, before, after: node });
    }
  }
  const nodesRemoved = base.nodes.filter((node) => !nextNodes.has(node.id));

  const edgesAdded = next.edges.filter((edge) => !baseEdges.has(edge.id));
  const edgesRemoved = base.edges.filter((edge) => !nextEdges.has(edge.id));

  const isEmpty =
    nodesAdded.length === 0 &&
    nodesRemoved.length === 0 &&
    nodesRelabeled.length === 0 &&
    edgesAdded.length === 0 &&
    edgesRemoved.length === 0;

  return {
    nodesAdded,
    nodesRemoved,
    nodesRelabeled,
    edgesAdded,
    edgesRemoved,
    isEmpty,
  };
}
