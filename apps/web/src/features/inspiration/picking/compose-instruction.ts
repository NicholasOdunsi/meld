import { formatInspirationBlock } from "./format-inspiration-block";
import type { PickedInspiration } from "./pick-inspiration";

const TASK_INSTRUCTION_MAX_CHARS = 4000;

/**
 * base → taste → Apple rules → inspiration, within the task limit. The owner's
 * words are never trimmed; inspiration lines go first, then the Apple block,
 * then the taste block.
 */
export function composeInstruction({
  base,
  tasteBlock,
  appleBlock = "",
  inspiration,
  maxChars = TASK_INSTRUCTION_MAX_CHARS,
}: {
  base: string;
  tasteBlock: string;
  appleBlock?: string;
  inspiration: PickedInspiration[];
  maxChars?: number;
}): string {
  const join = (...parts: string[]) => parts.filter(Boolean).join("\n\n");
  const hasTaste = tasteBlock.length > 0;
  for (let count = inspiration.length; count >= 0; count -= 1) {
    const block = count > 0 ? formatInspirationBlock(inspiration.slice(0, count), { hasTaste }) : "";
    const combined = join(base, tasteBlock, appleBlock, block);
    if (combined.length <= maxChars) return combined;
  }
  const withoutApple = join(base, tasteBlock);
  return withoutApple.length <= maxChars ? withoutApple : base;
}
