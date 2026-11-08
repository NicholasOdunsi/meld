import type { InspirationDevice, InspirationScreenType } from "@meld/contracts";

export type InspirationTarget = { device: InspirationDevice | null; screenType: InspirationScreenType | null };
type FormFactor = "mobile" | "tablet" | "desktop";

// Checked in order: the first match wins.
const DEVICE_KEYWORDS: [RegExp, InspirationDevice][] = [
  [/\b(desktop|mac) app\b/i, "desktop_app"],
  [/\b(ipad|tablet)\b/i, "tablet"],
  [/\b(mobile|iphone|android|phone)\b/i, "mobile"],
  [/\b(website|landing|web)\b/i, "web"],
];

const SCREEN_KEYWORDS: [RegExp, InspirationScreenType][] = [
  [/\bempty state\b/i, "empty_state"],
  [/\b(sign ?in|log ?in)\b/i, "login"],
  [/\b(sign ?up|register|create (an )?account)\b/i, "signup"],
  [/\b(onboarding|welcome)\b/i, "onboarding"],
  [/\b(dashboard|analytics)\b/i, "dashboard"],
  [/\b(pricing|plans)\b/i, "pricing"],
  [/\b(checkout|payment)\b/i, "checkout"],
  [/\b(cart|basket)\b/i, "cart"],
  [/\b(settings|preferences)\b/i, "settings"],
  [/\b(profile|account)\b/i, "profile"],
  [/\bsearch\b/i, "search"],
  [/\b(chat|messages?|inbox)\b/i, "chat"],
  [/\b(calendar|schedule)\b/i, "calendar"],
  [/\bmap\b/i, "map"],
  [/\b(error|404|not found)\b/i, "error"],
  [/\b(landing|marketing|homepage)\b/i, "landing"],
  [/\b(editor|compose)\b/i, "editor"],
  [/\bdetails?\b/i, "detail"],
  [/\b(list|feed)\b/i, "list"],
  [/\bhome\b/i, "home"],
  [/\b(modal|dialog)\b/i, "modal"],
];

const FORM_FACTOR_DEVICE: Record<FormFactor, InspirationDevice> = { mobile: "mobile", tablet: "tablet", desktop: "web" };

function firstMatch<T>(text: string, table: [RegExp, T][]): T | null {
  for (const [pattern, value] of table) if (pattern.test(text)) return value;
  return null;
}

function mostCommon(values: FormFactor[]): FormFactor | null {
  const counts = new Map<FormFactor, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: FormFactor | null = null;
  for (const [value, count] of counts) if (best === null || count > (counts.get(best) ?? 0)) best = value;
  return best;
}

export function inferTarget({
  instruction,
  screenName,
  roomFormFactors,
}: {
  instruction: string;
  screenName: string | null;
  roomFormFactors: FormFactor[];
}): InspirationTarget {
  const text = `${instruction} ${screenName ?? ""}`;
  const roomFactor = mostCommon(roomFormFactors);
  return {
    device: firstMatch(text, DEVICE_KEYWORDS) ?? (roomFactor ? FORM_FACTOR_DEVICE[roomFactor] : null),
    screenType: firstMatch(text, SCREEN_KEYWORDS),
  };
}
