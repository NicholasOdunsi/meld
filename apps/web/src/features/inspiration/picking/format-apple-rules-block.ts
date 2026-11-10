// format-apple-rules-block.ts
import type { InspirationDevice, TasteBoard } from "@meld/contracts";

export const APPLE_BLOCK_MAX_CHARS = 450;

const NON_APPLE = /\b(android|material design|windows|linux|pixel|samsung)\b/i;
const APPLE_DEVICES: InspirationDevice[] = ["mobile", "tablet", "desktop_app"];

/**
 * Inspiration labels only say "mobile", not iPhone vs Android, so a mobile,
 * tablet or desktop-app target counts as Apple unless the owner's words name
 * another platform.
 */
export function isAppleTarget(device: InspirationDevice | null, instruction: string): boolean {
  return device !== null && APPLE_DEVICES.includes(device) && !NON_APPLE.test(instruction);
}

const HEADER =
  "APPLE RULES (HIG; beat taste on usability, taste wins on look, room design system wins brand colour and fonts):";
const RULES = [
  "- tap targets at least 44pt",
  "- body 17pt iOS, 13pt Mac; never under 11pt (Mac 10pt)",
  "- Regular to Bold weights only; no Light or Thin",
  "- at most 2 typefaces; hierarchy via weight, size, colour",
  "- key content top and leading; group with space",
  "- controls distinct from content; readable contrast in Light and Dark",
];
const LIGHT_NOTE = "- use Regular, not Light";

export function formatAppleRulesBlock({
  enabled,
  appleTarget,
  board,
}: {
  enabled: boolean;
  appleTarget: boolean;
  board: TasteBoard | null;
}): string {
  if (!enabled || !appleTarget) return "";
  const lines = [HEADER, ...RULES];
  if (board?.typography.weight === "light") lines.push(LIGHT_NOTE);
  return lines.join("\n");
}
