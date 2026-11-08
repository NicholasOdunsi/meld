// apps/web/src/features/inspiration/taste/compute-taste-stats.ts
import type { InspirationLabels } from "@meld/contracts";

export type TasteLabelRow = { itemId: string; sortedAt: string; labels: InspirationLabels };
export type CountEntry = { value: string; count: number; itemIds: string[] };
export type TasteStatsSummary = {
  total: number;
  themes: CountEntry[];
  devices: CountEntry[];
  screenTypes: CountEntry[];
  colors: CountEntry[];
  styleWords: CountEntry[];
  patterns: CountEntry[];
};
export type TasteStats = TasteStatsSummary & { recent: TasteStatsSummary };

const EVIDENCE_PER_VALUE = 3;
const MAX_COLORS = 10;
const RECENT_SIZE = 5;

// Rows arrive newest first, so the first ids seen are the newest evidence.
function tally(rows: TasteLabelRow[], pick: (labels: InspirationLabels) => string[], limit = Infinity): CountEntry[] {
  const counts = new Map<string, { count: number; itemIds: string[] }>();
  for (const row of rows) {
    for (const value of new Set(pick(row.labels))) {
      const entry = counts.get(value) ?? { count: 0, itemIds: [] };
      entry.count += 1;
      if (entry.itemIds.length < EVIDENCE_PER_VALUE) entry.itemIds.push(row.itemId);
      counts.set(value, entry);
    }
  }
  return [...counts]
    .map(([value, entry]) => ({ value, ...entry }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, limit);
}

function summarise(rows: TasteLabelRow[]): TasteStatsSummary {
  return {
    total: rows.length,
    themes: tally(rows, (l) => [l.theme]),
    devices: tally(rows, (l) => [l.device]),
    screenTypes: tally(rows, (l) => [l.screenType]),
    colors: tally(rows, (l) => l.colors, MAX_COLORS),
    styleWords: tally(rows, (l) => l.styleWords),
    patterns: tally(rows, (l) => l.patterns),
  };
}

/** Pure: counts what the owner's sorted images have in common. */
export function computeTasteStats(rows: TasteLabelRow[]): TasteStats {
  const newestFirst = rows.toSorted(
    (a, b) => b.sortedAt.localeCompare(a.sortedAt) || a.itemId.localeCompare(b.itemId),
  );
  return { ...summarise(newestFirst), recent: summarise(newestFirst.slice(0, RECENT_SIZE)) };
}
