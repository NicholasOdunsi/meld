// apps/web/src/features/inspiration/taste/compute-taste-stats.test.ts
import type { InspirationLabels } from "@meld/contracts";
import { describe, expect, it } from "vitest";
import { computeTasteStats, type TasteLabelRow } from "./compute-taste-stats";

const labels = (over: Partial<InspirationLabels>): InspirationLabels => ({
  device: "mobile",
  screenType: "login",
  patterns: ["form"],
  theme: "light",
  colors: ["#ffffff", "#000000"],
  styleWords: ["minimal"],
  description: "d",
  ...over,
});
const row = (n: number, over: Partial<InspirationLabels> = {}): TasteLabelRow => ({
  itemId: `00000000-0000-4000-8000-00000000000${n}`,
  sortedAt: `2026-11-0${n}T00:00:00.000Z`,
  labels: labels(over),
});

describe("computeTasteStats", () => {
  it("counts values once per image and keeps the 3 newest evidence ids", () => {
    const rows = [
      row(1),
      row(2),
      row(3, { theme: "dark" }),
      row(4),
      row(5, { colors: ["#ffffff", "#ffffff"] }),
    ];
    const stats = computeTasteStats(rows);
    expect(stats.total).toBe(5);
    expect(stats.themes[0]).toEqual({
      value: "light",
      count: 4,
      itemIds: [rows[4].itemId, rows[3].itemId, rows[1].itemId],
    });
    expect(stats.colors.find((c) => c.value === "#ffffff")?.count).toBe(5);
  });

  it("summarises the 5 newest images separately", () => {
    const rows = [1, 2, 3, 4, 5, 6, 7].map((n) => row(n, n >= 5 ? { styleWords: ["playful"] } : {}));
    const stats = computeTasteStats(rows);
    expect(stats.recent.total).toBe(5);
    expect(stats.recent.styleWords.find((w) => w.value === "playful")?.count).toBe(3);
    expect(stats.styleWords[0].value).toBe("minimal");
  });

  it("caps colours at 10 and sorts ties alphabetically", () => {
    const rows = [row(1, { colors: ["#000001", "#000002", "#000003", "#000004", "#000005"] }),
      row(2, { colors: ["#000006", "#000007", "#000008", "#000009", "#00000a"] }),
      row(3, { colors: ["#00000b"] })];
    const stats = computeTasteStats(rows);
    expect(stats.colors).toHaveLength(10);
    expect(stats.colors[0].value).toBe("#000001");
  });
});
