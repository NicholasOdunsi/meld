import { describe, expect, it } from "vitest";
import { locateElementAt, offsetOf } from "./locate-element";

const SOURCE = [
  "export default function Home() {",
  "  return (",
  "    <main className=\"hero\">",
  "      <h1 className=\"greet-1\">{name}</h1>",
  "      <p>Plan your day</p>",
  "    </main>",
  "  );",
  "}",
].join("\n");

describe("offsetOf", () => {
  it("turns a 1-based line and column into an offset", () => {
    expect(offsetOf(SOURCE, 1, 1)).toBe(0);
    expect(SOURCE.slice(offsetOf(SOURCE, 4, 7)!, offsetOf(SOURCE, 4, 7)! + 3)).toBe("<h1");
  });
  it("rejects positions outside the file", () => {
    expect(offsetOf(SOURCE, 0, 1)).toBeNull();
    expect(offsetOf(SOURCE, 99, 1)).toBeNull();
    expect(offsetOf(SOURCE, 1, 0)).toBeNull();
  });
});

describe("locateElementAt", () => {
  it("returns the range of the element whose opening < is at the position", () => {
    const range = locateElementAt(SOURCE, "app/page.tsx", 4, 7)!;
    expect(SOURCE.slice(range.start, range.end)).toBe("<h1 className=\"greet-1\">{name}</h1>");
  });
  it("returns the outer element for the outer position", () => {
    const range = locateElementAt(SOURCE, "app/page.tsx", 3, 5)!;
    expect(SOURCE.slice(range.start, range.start + 5)).toBe("<main");
    expect(SOURCE.slice(range.end - 7, range.end)).toBe("</main>");
  });
  it("returns null when no element starts there", () => {
    expect(locateElementAt(SOURCE, "app/page.tsx", 4, 8)).toBeNull();
  });
  it("returns null for code that does not parse", () => {
    expect(locateElementAt("const = ;", "app/page.tsx", 1, 1)).toBeNull();
  });
});
