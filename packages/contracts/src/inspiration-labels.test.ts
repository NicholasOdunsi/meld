import { describe, expect, it } from "vitest";
import { InspirationLabelsSchema } from "./inspiration-labels";

const GOOD = {
  device: "mobile",
  screenType: "login",
  patterns: ["form", "illustration"],
  theme: "dark",
  colors: ["#0F172A", "#6366f1"],
  styleWords: ["minimal", "bold-type"],
  description: "Big bold headline over a soft gradient; one primary button.",
};

describe("InspirationLabelsSchema", () => {
  it("accepts a good answer and lower-cases colours", () => {
    const parsed = InspirationLabelsSchema.parse(GOOD);
    expect(parsed.colors).toEqual(["#0f172a", "#6366f1"]);
  });

  it("drops unknown keys the model adds", () => {
    expect(InspirationLabelsSchema.parse({ ...GOOD, confidence: 0.9 })).not.toHaveProperty("confidence");
  });

  it.each([
    ["unknown device", { device: "watch" }],
    ["unknown screen type", { screenType: "sign-in" }],
    ["unknown pattern", { patterns: ["navbar"] }],
    ["repeated pattern", { patterns: ["form", "form"] }],
    ["too many patterns", { patterns: ["form", "cards", "chart", "table", "hero", "grid", "fab"] }],
    ["bad theme", { theme: "dim" }],
    ["no colours", { colors: [] }],
    ["too many colours", { colors: ["#000000", "#111111", "#222222", "#333333", "#444444", "#555555"] }],
    ["bad colour", { colors: ["blue"] }],
    ["too many style words", { styleWords: ["a", "b", "c", "d"] }],
    ["style word with spaces", { styleWords: ["very bold"] }],
    ["empty description", { description: "   " }],
    ["long description", { description: "x".repeat(401) }],
  ])("rejects %s", (_name, patch) => {
    expect(InspirationLabelsSchema.safeParse({ ...GOOD, ...patch }).success).toBe(false);
  });
});
