import { z } from "zod";
import type { FlowDocument } from "@meld/contracts";

export const SCREEN_SEED_FRAME_WIDTH = 390;
export const SCREEN_SEED_GAP = 80;
export const SCREEN_SEED_BASELINE_Y = 1200;

export const ScreenSeedSchema = z
  .object({
    nodeId: z.string(),
    name: z.string(),
    x: z.number(),
    y: z.number(),
  })
  .strict();
export type ScreenSeed = z.infer<typeof ScreenSeedSchema>;

// One empty screen per Define-flow `action` node that has no screen yet. Logic
// nodes (system/decision) and terminals (start/end) are not screens. Deterministic
// so the same flow + existing set always seeds the same rows at the same spots.
export function planScreenSeeds(
  flow: FlowDocument | null,
  existingFlowNodeIds: readonly string[],
): ScreenSeed[] {
  if (!flow) return [];
  const existing = new Set(existingFlowNodeIds);
  const unseeded = flow.nodes.filter(
    (node) => node.kind === "action" && !existing.has(node.id),
  );
  return unseeded.map((node, index) => ({
    nodeId: node.id,
    name: node.label,
    x: index * (SCREEN_SEED_FRAME_WIDTH + SCREEN_SEED_GAP),
    y: SCREEN_SEED_BASELINE_Y,
  }));
}
