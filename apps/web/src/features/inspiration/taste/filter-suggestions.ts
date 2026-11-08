import {
  applyTasteOperation,
  tasteValueKey,
  type TasteBoard,
  type TasteSuggestion,
} from "@meld/contracts";

export const MAX_TASTE_SUGGESTIONS = 5;
export const LOCK_EVIDENCE_IMAGES = 5;

export type ReadySuggestion = TasteSuggestion & { valueKey: string };
export type FilterContext = {
  board: TasteBoard;
  locks: Record<string, number>;
  sortedCount: number;
  rejectedKeys: ReadonlySet<string>;
  ownItemIds: ReadonlySet<string>;
};

/** Spec B2: drop what the owner must never see, before anything is stored. */
export function filterSuggestions(suggestions: TasteSuggestion[], ctx: FilterContext): ReadySuggestion[] {
  const ready: ReadySuggestion[] = [];
  const seen = new Set<string>();
  for (const suggestion of suggestions) {
    if (ready.length >= MAX_TASTE_SUGGESTIONS) break;
    const valueKey = tasteValueKey(suggestion);
    if (seen.has(valueKey) || ctx.rejectedKeys.has(valueKey)) continue;
    const lockedAt = ctx.locks[suggestion.tile];
    if (lockedAt !== undefined && ctx.sortedCount - lockedAt < LOCK_EVIDENCE_IMAGES) continue;
    if (suggestion.evidenceItemIds.some((id) => !ctx.ownItemIds.has(id))) continue;
    // Covers no-ops, missing items, overflow and duplicate colours.
    if (applyTasteOperation(ctx.board, suggestion) === null) continue;
    seen.add(valueKey);
    ready.push({ ...suggestion, valueKey });
  }
  return ready;
}
