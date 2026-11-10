import { resolveTasteBoard, type TasteBoard, type TasteMotion } from "@meld/contracts";

export const CRAFT_BLOCK_MAX_CHARS = 800;

const HEADER = "CRAFT RULES (always apply; the owner's taste decides the look, these protect usability):";
const RULES = [
  "- buttons scale to 0.96 when pressed (150ms ease-out); never on disabled controls",
  "- things exit faster and smaller than they enter (150ms, 12px up, 4px blur)",
  "- never animate constant actions: keyboard shortcuts, hovering rows, tab switches",
  "- respect Reduce Motion: fade instead of move",
  "- numbers that change use tabular figures",
  "- nested rounded corners: outer radius = inner radius + padding",
  "- tap targets at least 44px, even when the icon is small",
  "- errors and warnings are calm, plain, and say how to fix it",
];
const MOTION_LINE: Record<TasteMotion, string> = {
  instant: "- motion: instant, opacity only, no movement",
  snappy: "- motion: snappy, 150ms ease-out cubic-bezier(0.2, 0, 0, 1), no bounce",
  smooth: "- motion: smooth, 300ms on the same curve, no bounce",
  playful: "- motion: playful, 450ms with one small overshoot (about 3%), never on icon swaps",
};

/** The fixed floor under every generated screen. Always non-empty; motion follows the board (default snappy). */
export function formatCraftRulesBlock(board: TasteBoard | null): string {
  const motion = board ? resolveTasteBoard(board).motion : "snappy";
  return [HEADER, ...RULES, MOTION_LINE[motion]].join("\n");
}
