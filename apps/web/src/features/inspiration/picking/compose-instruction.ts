import { formatInspirationBlock } from "./format-inspiration-block";
import type { PickedInspiration } from "./pick-inspiration";

const TASK_INSTRUCTION_MAX_CHARS = 4000;

/**
 * base → taste → inspiration, within the task limit. The owner's words are
 * never trimmed; inspiration lines go first, then (if still too long) the
 * taste block.
 */
export function composeInstruction({
  base,
  tasteBlock,
  inspiration,
  maxChars = TASK_INSTRUCTION_MAX_CHARS,
}: {
  base: string;
  tasteBlock: string;
  inspiration: PickedInspiration[];
  maxChars?: number;
}): string {
  const join = (...parts: string[]) => parts.filter(Boolean).join("\n\n");
  const hasTaste = tasteBlock.length > 0;
  for (let count = inspiration.length; count >= 0; count -= 1) {
    const block = count > 0 ? formatInspirationBlock(inspiration.slice(0, count), { hasTaste }) : "";
    const combined = join(base, tasteBlock, block);
    if (combined.length <= maxChars) return combined;
  }
  return base;
}
