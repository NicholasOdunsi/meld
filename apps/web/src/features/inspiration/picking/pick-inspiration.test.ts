import type { InspirationLabels } from "@meld/contracts";
import { describe, expect, it } from "vitest";
import { pickInspiration, scoreCandidate, type InspirationCandidate } from "./pick-inspiration";

function labels(patch: Partial<InspirationLabels>): InspirationLabels {
  return { device: "web", screenType: "other", patterns: [], theme: "light", colors: ["#ffffff"], styleWords: [], description: "d", ...patch };
}
function item(id: string, patch: Partial<InspirationLabels>, addedAt = "2026-11-01T00:00:00.000Z"): InspirationCandidate {
  return { itemId: id, labels: labels(patch), addedAt };
}
const target = { device: "mobile", screenType: "login" } as const;

describe("scoreCandidate", () => {
  it("weights screen type 3, device 2, implied pattern 1 each", () => {
    expect(scoreCandidate(target, labels({ device: "mobile", screenType: "login", patterns: ["form"] }))).toBe(6);
    expect(scoreCandidate(target, labels({ device: "mobile" }))).toBe(2);
    expect(scoreCandidate({ device: null, screenType: null }, labels({ device: "mobile" }))).toBe(0);
  });
});

describe("pickInspiration", () => {
  it("puts room items first, then fills from the library with score >= 2, capped at 6", () => {
    const roomItems = [item("r-weak", {}), item("r-strong", { screenType: "login" })];
    const libraryItems = [
      item("l-device", { device: "mobile" }),
      item("l-none", {}),
      ...["a", "b", "c", "d", "e"].map((id) => item(`l-${id}`, { screenType: "login", device: "mobile" })),
    ];
    const picked = pickInspiration({ target, roomItems, libraryItems }).map((entry) => entry.itemId);
    expect(picked.slice(0, 2)).toEqual(["r-strong", "r-weak"]);
    expect(picked).toHaveLength(6);
    expect(picked).not.toContain("l-none");
    expect(picked).not.toContain("l-device"); // outranked by the five full matches
  });

  it("never repeats a room item from the library and breaks ties by newest", () => {
    const shared = item("same", { screenType: "login" });
    const picked = pickInspiration({
      target,
      roomItems: [shared],
      libraryItems: [shared, item("old", { screenType: "login" }, "2026-01-01T00:00:00.000Z"), item("new", { screenType: "login" }, "2026-11-05T00:00:00.000Z")],
    }).map((entry) => entry.itemId);
    expect(picked).toEqual(["same", "new", "old"]);
  });

  it("adds nothing from the library when nothing matches", () => {
    expect(pickInspiration({ target, roomItems: [], libraryItems: [item("x", { device: "web", screenType: "pricing" })] })).toEqual([]);
  });

  it("tags each pick with where it came from", () => {
    const ROOM_ITEM = item("r-origin", { device: "mobile", screenType: "login", patterns: ["form"] });
    const LIBRARY_ITEM = item("l-origin", { device: "mobile", screenType: "login", patterns: ["form"] });
    const picks = pickInspiration({ target, roomItems: [ROOM_ITEM], libraryItems: [LIBRARY_ITEM] });
    expect(picks.map((p) => p.origin)).toEqual(["room", "library"]);
  });
});
