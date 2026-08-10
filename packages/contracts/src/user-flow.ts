import { z } from "zod";

export const MAX_FLOW_NODES = 40;
export const MAX_FLOW_EDGES = 80;
export const MAX_FLOW_OPEN_QUESTIONS = 10;
export const MAX_FLOW_LABEL_CHARS = 80;
export const MAX_FLOW_DETAIL_CHARS = 500;
export const MAX_FLOW_EDGE_LABEL_CHARS = 120;

export const FlowNodeKindSchema = z.enum([
  "start",
  "action",
  "system",
  "decision",
  "end",
]);
export type FlowNodeKind = z.infer<typeof FlowNodeKindSchema>;

const FlowRecordIdSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_-]*$/)
  .max(64);

export const FlowNodeSchema = z
  .object({
    id: FlowRecordIdSchema,
    kind: FlowNodeKindSchema,
    label: z.string().trim().min(1).max(MAX_FLOW_LABEL_CHARS),
    detail: z
      .string()
      .trim()
      .min(1)
      .max(MAX_FLOW_DETAIL_CHARS)
      .nullable(),
  })
  .strict();
export type FlowNode = z.infer<typeof FlowNodeSchema>;

export const FlowEdgeSchema = z
  .object({
    id: FlowRecordIdSchema,
    from: FlowRecordIdSchema,
    to: FlowRecordIdSchema,
    label: z
      .string()
      .trim()
      .min(1)
      .max(MAX_FLOW_EDGE_LABEL_CHARS)
      .nullable(),
  })
  .strict();
export type FlowEdge = z.infer<typeof FlowEdgeSchema>;

const FlowDocumentShapeSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    summary: z.string().trim().min(1).max(1_000),
    nodes: z.array(FlowNodeSchema).min(1).max(MAX_FLOW_NODES),
    edges: z.array(FlowEdgeSchema).max(MAX_FLOW_EDGES),
    openQuestions: z
      .array(z.string().trim().min(1).max(MAX_FLOW_DETAIL_CHARS))
      .max(MAX_FLOW_OPEN_QUESTIONS),
  })
  .strict();

function addGraphIssue(
  ctx: z.RefinementCtx,
  message: string,
  path: (string | number)[] = [],
): void {
  ctx.addIssue({ code: "custom", message, path });
}

function validateGraph(
  value: z.infer<typeof FlowDocumentShapeSchema>,
  ctx: z.RefinementCtx,
): void {
  const nodeIds = new Set<string>();
  const nodeById = new Map<string, FlowNode>();
  for (const [index, node] of value.nodes.entries()) {
    if (nodeIds.has(node.id)) {
      addGraphIssue(ctx, `Duplicate flow node id: ${node.id}`, ["nodes", index, "id"]);
    }
    nodeIds.add(node.id);
    nodeById.set(node.id, node);
  }

  const edgeIds = new Set<string>();
  const allIds = new Set(nodeIds);
  for (const [index, edge] of value.edges.entries()) {
    if (edgeIds.has(edge.id) || allIds.has(edge.id)) {
      addGraphIssue(ctx, `Duplicate flow edge id: ${edge.id}`, ["edges", index, "id"]);
    }
    edgeIds.add(edge.id);
    allIds.add(edge.id);
    if (!nodeIds.has(edge.from)) {
      addGraphIssue(ctx, `Flow edge has an unknown source: ${edge.from}`, ["edges", index, "from"]);
    }
    if (!nodeIds.has(edge.to)) {
      addGraphIssue(ctx, `Flow edge has an unknown target: ${edge.to}`, ["edges", index, "to"]);
    }
  }

  const starts = value.nodes.filter((node) => node.kind === "start");
  if (starts.length !== 1) {
    addGraphIssue(ctx, "A flow must contain exactly one start node", ["nodes"]);
  }
  if (!value.nodes.some((node) => node.kind === "end")) {
    addGraphIssue(ctx, "A flow must contain at least one end node", ["nodes"]);
  }

  const adjacency = new Map<string, string[]>();
  for (const node of value.nodes) adjacency.set(node.id, []);
  for (const edge of value.edges) {
    const targets = adjacency.get(edge.from);
    if (targets && nodeIds.has(edge.to)) targets.push(edge.to);
  }

  if (starts.length === 1) {
    const reachable = new Set<string>();
    const queue = [starts[0].id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (reachable.has(current)) continue;
      reachable.add(current);
      queue.push(...(adjacency.get(current) ?? []));
    }

    for (const [index, node] of value.nodes.entries()) {
      if (!reachable.has(node.id)) {
        addGraphIssue(
          ctx,
          `Flow node is not reachable from the start: ${node.id}`,
          ["nodes", index, "id"],
        );
      }
    }
    if (!value.nodes.some((node) => node.kind === "end" && reachable.has(node.id))) {
      addGraphIssue(ctx, "A flow must contain a reachable end node", ["nodes"]);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const reportedCycles = new Set<string>();

  const visit = (nodeId: string): void => {
    visiting.add(nodeId);
    stack.push(nodeId);
    for (const target of adjacency.get(nodeId) ?? []) {
      if (visiting.has(target)) {
        const cycleStart = stack.indexOf(target);
        const cycleNodes = stack.slice(cycleStart);
        const cycleKey = [...cycleNodes].sort().join(",");
        if (!reportedCycles.has(cycleKey)) {
          reportedCycles.add(cycleKey);
          const hasDecision = cycleNodes.some(
            (id) => nodeById.get(id)?.kind === "decision",
          );
          if (!hasDecision) {
            addGraphIssue(
              ctx,
              "Cycles are only allowed when the cycle contains a decision node",
              ["edges"],
            );
          }
        }
      } else if (!visited.has(target)) {
        visit(target);
      }
    }
    stack.pop();
    visiting.delete(nodeId);
    visited.add(nodeId);
  };

  for (const node of value.nodes) {
    if (!visited.has(node.id)) visit(node.id);
  }
}

export const FlowDocumentSchema = FlowDocumentShapeSchema.superRefine(
  validateGraph,
);
export type FlowDocument = z.infer<typeof FlowDocumentSchema>;
