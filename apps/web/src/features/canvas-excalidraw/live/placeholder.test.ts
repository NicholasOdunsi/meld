import { describe, expect, it, vi } from "vitest";
import { sleepingDocument, sleepingPlaceholder } from "./placeholder";

describe("sleepingPlaceholder", () => {
  it("names the screen, escapes it and has no script", () => {
    const html = sleepingPlaceholder('<b>"Plans"</b>');
    expect(html).toContain("&#60;b&#62;&#34;Plans&#34;&#60;/b&#62;");
    expect(html).toContain("Double-click to open");
    expect(html).not.toContain("<script");
  });
});

describe("sleepingDocument", () => {
  it("uses the placeholder for source screens and the legacy document otherwise", () => {
    const legacy = vi.fn(() => "<legacy>");
    expect(sleepingDocument({ name: "Today", sourceKind: "react" }, legacy)).toContain("Today");
    expect(legacy).not.toHaveBeenCalled();
    expect(sleepingDocument({ name: "Old" }, legacy)).toBe("<legacy>");
  });
});
