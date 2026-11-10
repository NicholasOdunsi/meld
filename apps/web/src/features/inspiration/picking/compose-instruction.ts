import { formatInspirationBlock } from "./format-inspiration-block";
import type { PickedInspiration } from "./pick-inspiration";

const TASK_INSTRUCTION_MAX_CHARS = 4000;

/**
 * base → taste → craft rules → inspiration, within the task limit. The owner's
 * words are never trimmed; when too long, inspiration goes first, then the
 * taste block, then the craft block.
 */
export function composeInstruction({
  base,
  tasteBlock,
  craftBlock = "",
  inspiration,
  maxChars = TASK_INSTRUCTION_MAX_CHARS,
}: {
  base: string;
  tasteBlock: string;
  craftBlock?: string;
  inspiration: PickedInspiration[];
  maxChars?: number;
}): string {
  const join = (...parts: string[]) => parts.filter(Boolean).join("\n\n");
  const hasTaste = tasteBlock.length > 0;
  for (let count = inspiration.length; count >= 0; count -= 1) {
    const block = count > 0 ? formatInspirationBlock(inspiration.slice(0, count), { hasTaste }) : "";
    const combined = join(base, tasteBlock, craftBlock, block);
    if (combined.length <= maxChars) return combined;
  }
  const withoutTaste = join(base, craftBlock);
  return withoutTaste.length <= maxChars ? withoutTaste : base;
}
