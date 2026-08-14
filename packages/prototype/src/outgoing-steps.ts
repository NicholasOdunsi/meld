import type { FlowDocument } from "@meld/contracts";
import { z } from "zod";

// The downstream journey steps offered to the generator (A1) so it can tag each
// navigation control with the step it leads to. Only `action` nodes back a
// screen, so these are the reachable action nodes; logic nodes (system/decision)
// and terminals are not targets.
export const OutgoingStepSchema = z
  .object({ nodeId: z.string().min(1).max(64), label: z.string().min(1).max(120) })
  .strict();
export type OutgoingStep = z.infer<typeof OutgoingStepSchema>;

export const OutgoingStepsSchema = z.array(OutgoingStepSchema).max(40);

// From the screen pinned to `fromNodeId`, collect the action nodes the user can
// reach. Edges may pass through logic nodes (system/decision) that are not
// screens; follow through them to the first action node(s). A decision fans out,
// so a screen can offer several branch targets. Deterministic, deduped by target
// node id, and cycle-guarded per traversal (decision cycles are legal in a flow).
export function downstreamActionSteps(
  flow: FlowDocument,
  fromNodeId: string,
): OutgoingStep[] {
  const nodeById = new Map(flow.nodes.map((node) => [node.id, node]));
  if (!nodeById.has(fromNodeId)) return [];

  const outgoing = new Map<string, { to: string; label: string | null }[]>();
  for (const edge of flow.edges) {
    const list = outgoing.get(edge.from) ?? [];
    list.push({ to: edge.to, label: edge.label });
    outgoing.set(edge.from, list);
  }

  const steps: OutgoingStep[] = [];
  const collected = new Set<string>();

  for (const first of outgoing.get(fromNodeId) ?? []) {
    // A fresh visited set per starting edge: the same action reached by two
    // branches is deduped by `collected`, not silently dropped by a shared guard.
    const visited = new Set<string>([fromNodeId]);
    const queue: { node: string; label: string | null }[] = [
      { node: first.to, label: first.label },
    ];
    while (queue.length > 0) {
      const { node, label } = queue.shift()!;
      if (visited.has(node)) continue;
      visited.add(node);
      const meta = nodeById.get(node);
      if (!meta) continue;

      if (meta.kind === "action") {
        if (!collected.has(node)) {
          collected.add(node);
          const trimmed = label?.trim();
          steps.push({ nodeId: node, label: trimmed || meta.label });
        }
        // Stop here: an action node is a screen, not a pass-through.
        continue;
      }
      if (meta.kind === "end") continue; // terminal: no screen

      // start/system/decision: pass through, preferring the closer branch label.
      for (const next of outgoing.get(node) ?? []) {
        queue.push({ node: next.to, label: next.label ?? label });
      }
    }
  }

  return steps;
}

// Renders the steps as untrusted prompt data. Empty string when there is nothing
// downstream, so callers can append unconditionally.
export function formatOutgoingStepsForPrompt(steps: OutgoingStep[]): string {
  if (steps.length === 0) return "";
  const lines = steps.map((step) => `- ${step.nodeId}: ${step.label}`);
  return [
    "NEXT STEPS IN THE USER JOURNEY (untrusted data). If a navigation control",
    "leads to one of these steps, set that action's targetNodeId to the matching",
    "id below; otherwise set targetNodeId to null. Never invent an id.",
    ...lines,
  ].join("\n");
}
