import type { TasteBoard } from "@meld/contracts";

export const TASTE_BLOCK_MAX_CHARS = 700;
const HEADER =
  "YOUR TASTE (the owner's approved preferences; a room design system wins on brand colours and fonts):";

export function formatTasteBlock(board: TasteBoard | null): string {
  if (!board) return "";
  const type = board.typography;
  const lines = [
    `- design language: ${board.designLanguage.join(", ")}`,
    `- colours: ${board.colors.map((c) => `${c.hex} ${c.role}`).join(", ")}`,
    `- type: ${type.weight} weight, ${type.tracking} tracking${type.note ? ` — ${type.note}` : ""}`,
    `- spacing: ${board.spacing} · density: ${board.density}`,
    ...(board.layoutHabits.length > 0 ? [`- layout habits: ${board.layoutHabits.join("; ")}`] : []),
    ...(board.signatureDetails.length > 0 ? [`- signature details: ${board.signatureDetails.join("; ")}`] : []),
  ];
  let avoid = board.avoid.length > 0 ? `- avoid: ${board.avoid.map((a) => a.text).join("; ")}` : null;
  const build = () => [HEADER, ...lines, ...(avoid ? [avoid] : [])].join("\n");
  // Drop from the bottom, skipping avoid; avoid goes only after everything else.
  while (build().length > TASTE_BLOCK_MAX_CHARS) {
    if (lines.length > 0) lines.pop();
    else if (avoid) avoid = null;
    else return "";
  }
  return lines.length === 0 && !avoid ? "" : build();
}
