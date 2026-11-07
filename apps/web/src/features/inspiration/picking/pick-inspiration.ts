import type { InspirationLabels, InspirationPattern, InspirationScreenType } from "@meld/contracts";
import type { InspirationTarget } from "./infer-target";

export type InspirationCandidate = { itemId: string; labels: InspirationLabels; addedAt: string };

export const MAX_INSPIRATION = 6;
export const MIN_LIBRARY_SCORE = 2;

// Patterns a screen type usually contains; each shared one adds a point.
const IMPLIED_PATTERNS: Partial<Record<InspirationScreenType, InspirationPattern[]>> = {
  login: ["form"],
  signup: ["form", "stepper"],
  onboarding: ["stepper", "illustration", "carousel"],
  home: ["cards", "tab_bar"],
  dashboard: ["chart", "cards", "table", "sidebar"],
  list: ["list_rows", "filters", "search_bar"],
  search: ["search_bar", "filters", "list_rows"],
  profile: ["avatar"],
  settings: ["form", "list_rows", "sidebar"],
  pricing: ["cards"],
  checkout: ["form", "stepper"],
  chat: ["list_rows", "avatar"],
  landing: ["hero", "top_nav", "grid"],
};

export function scoreCandidate(target: InspirationTarget, labels: InspirationLabels): number {
  let score = 0;
  if (target.screenType && labels.screenType === target.screenType) score += 3;
  if (target.device && labels.device === target.device) score += 2;
  const implied = target.screenType ? (IMPLIED_PATTERNS[target.screenType] ?? []) : [];
  for (const pattern of labels.patterns) if (implied.includes(pattern)) score += 1;
  return score;
}

function ranked(target: InspirationTarget, items: InspirationCandidate[]) {
  return items
    .map((item) => ({ item, score: scoreCandidate(target, item.labels) }))
    .sort((a, b) => b.score - a.score || b.item.addedAt.localeCompare(a.item.addedAt));
}

// Room images first (the owner chose them), then the best library matches.
export function pickInspiration({
  target,
  roomItems,
  libraryItems,
}: {
  target: InspirationTarget;
  roomItems: InspirationCandidate[];
  libraryItems: InspirationCandidate[];
}): InspirationCandidate[] {
  const picked = ranked(target, roomItems).map(({ item }) => item).slice(0, MAX_INSPIRATION);
  const taken = new Set(picked.map((item) => item.itemId));
  for (const { item, score } of ranked(target, libraryItems)) {
    if (picked.length >= MAX_INSPIRATION) break;
    if (score < MIN_LIBRARY_SCORE || taken.has(item.itemId)) continue;
    picked.push(item);
    taken.add(item.itemId);
  }
  return picked;
}
