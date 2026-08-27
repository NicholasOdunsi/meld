import { describe, expect, it } from "vitest";
import {
  extractComponentVocabulary,
  formatComponentVocabulary,
} from "./component-vocabulary";

describe("extractComponentVocabulary", () => {
  it("keeps a single-class rule's visually defining declarations", () => {
    const out = extractComponentVocabulary(`
      .metric-card {
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 20px;
        display: flex;
        flex-direction: column;
      }
    `);
    expect(out).toEqual([
      {
        className: "metric-card",
        declarations: [
          "background: #ffffff",
          "border: 1px solid #e5e7eb",
          "border-radius: 8px",
          "padding: 20px",
        ],
      },
    ]);
  });

  it("puts container-ish components first, since those are the ones that go missing", () => {
    const out = extractComponentVocabulary(`
      .subtitle { color: #6b7280; font-size: 13px; }
      .content-card { background: #fff; border: 1px solid #eee; border-radius: 8px; }
    `);
    expect(out.map((entry) => entry.className)).toEqual([
      "content-card",
      "subtitle",
    ]);
  });

  it("ignores at-rules, compound selectors and rules with nothing visual to say", () => {
    const out = extractComponentVocabulary(`
      @media (max-width: 600px) { .metric-card { padding: 8px; } }
      .alerts-section .alert-card { border: 1px solid #eee; }
      .row > .cell { padding: 4px; }
      .layout-only { display: grid; grid-template-columns: 1fr 1fr; }
      .badge { background: #eef; border-radius: 999px; }
    `);
    expect(out.map((entry) => entry.className)).toEqual(["badge"]);
  });

  it("caps how many components it reports", () => {
    const styles = Array.from(
      { length: 40 },
      (_, index) => `.c${index} { background: #fff; border: 1px solid #eee; }`,
    ).join("\n");
    expect(extractComponentVocabulary(styles, { maxComponents: 6 })).toHaveLength(6);
  });
});

describe("formatComponentVocabulary", () => {
  it("names its source and tells the model a variation request wins", () => {
    const text = formatComponentVocabulary("Ownership Transfer Dashboard", [
      {
        className: "metric-card",
        declarations: ["background: #fff", "border-radius: 8px"],
      },
    ]);
    expect(text).toContain("EXISTING COMPONENTS");
    expect(text).toContain("Ownership Transfer Dashboard");
    expect(text).toContain(".metric-card { background: #fff; border-radius: 8px }");
    // The carve-out: reuse is the default, never a cage.
    expect(text.toLowerCase()).toContain("variation");
    expect(text.toLowerCase()).toContain("follow the request instead");
  });

  it("is empty when there is no vocabulary to describe", () => {
    expect(formatComponentVocabulary("Anything", [])).toBe("");
  });

  it("stops at its character budget rather than crowding out the instruction", () => {
    const many = Array.from({ length: 40 }, (_, index) => ({
      className: `component-with-a-long-name-${index}`,
      declarations: ["background: #ffffff", "border: 1px solid #e5e7eb"],
    }));
    const text = formatComponentVocabulary("Source", many, { maxChars: 300 });
    expect(text.length).toBeLessThanOrEqual(300);
    expect(text).toContain("EXISTING COMPONENTS");
  });
});
