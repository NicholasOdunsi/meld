import type { SketchLayout } from "./sketch-layout";

export function formatSketchLayoutForPrompt(layout: SketchLayout): string {
  if (layout.boxes.length === 0) return "";
  const lines = layout.boxes.map((b) => {
    const where = `${b.position.vertical}-${b.position.horizontal}`;
    const what = `${b.size.width} ${b.shapeKind}`;
    return b.text ? `- ${what} at ${where}: "${b.text}"` : `- ${what} at ${where}`;
  });
  const note = layout.truncated ? "\n(additional shapes were omitted)" : "";
  return `The user sketched this rough layout — use it for WHERE things go; the instruction says WHAT each region is:\n${lines.join("\n")}${note}`;
}

const JOINER = "\n\n";

// The RPC that persists the instruction (create_design_screen_generate_task)
// caps it at maxChars via `left(instruction, 4000)`. The user's typed
// instruction is itself allowed up to that same cap, so a naive
// concatenation of instruction + layout block can have the layout guidance
// -- which is the whole point of sketching -- silently clipped or truncated
// mid-word by the database. Budget the combination here, in the web layer,
// before either the fake or real generation path sees it, so both agree and
// the layout block always survives intact when it can possibly fit.
export function combineInstructionWithLayout(
  instruction: string,
  layoutBlock: string,
  maxChars = 4000,
): string {
  if (!layoutBlock) return instruction;
  const combined = `${instruction}${JOINER}${layoutBlock}`;
  if (combined.length <= maxChars) return combined;

  const budgetForInstruction = maxChars - JOINER.length - layoutBlock.length;
  if (budgetForInstruction < 0) {
    // Pathological: the layout block alone (plus joiner) exceeds the cap.
    // Fall back to a plain left-truncation of the combined string so the
    // result never exceeds maxChars.
    return combined.slice(0, maxChars);
  }

  return `${instruction.slice(0, budgetForInstruction)}${JOINER}${layoutBlock}`;
}

// Generalizes combineInstructionWithLayout to N untrusted-data blocks (e.g. the
// sketch layout AND the downstream-journey NEXT STEPS block together). Kept as
// a separate function rather than reimplementing combineInstructionWithLayout
// in terms of it: that function's signature/behavior is depended on directly
// (the connector prompt tests, callers) and must not change.
//
// All non-empty blocks are joined together first and treated as a single unit
// whose combined length is reserved up front, so every block that's supplied
// survives intact whenever the whole thing can possibly fit -- only the
// instruction is ever trimmed, and it's always trimmed from the left (its own
// tail, not any block, is what gets cut). This matters because a naive chain
// of two combineInstructionWithLayout calls would treat the first call's
// output (instruction + layout) as a new "instruction" for the second call,
// and truncating *that* from the left can eat into the previously-embedded
// layout block instead of preserving it.
export function combineInstructionWithBlocks(
  instruction: string,
  blocks: string[],
  maxChars = 4000,
): string {
  const nonEmpty = blocks.filter((block) => block.length > 0);
  if (nonEmpty.length === 0) return instruction;

  const joinedBlocks = nonEmpty.join(JOINER);
  const combined = `${instruction}${JOINER}${joinedBlocks}`;
  if (combined.length <= maxChars) return combined;

  const budgetForInstruction = maxChars - JOINER.length - joinedBlocks.length;
  if (budgetForInstruction < 0) {
    // Pathological: the blocks alone (plus joiners) exceed the cap. Fall back
    // to a plain left-truncation of the combined string so the result never
    // exceeds maxChars.
    return combined.slice(0, maxChars);
  }

  return `${instruction.slice(0, budgetForInstruction)}${JOINER}${joinedBlocks}`;
}
