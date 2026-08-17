import { describe, expect, it } from "vitest";
import { lucideIconResolver } from "./lucide-icon-resolver";

describe("lucideIconResolver", () => {
  it("returns inner svg markup for a known lucide name", () => {
    const inner = lucideIconResolver("search");
    expect(inner).not.toBeNull();
    // search is a circle + a path in lucide
    expect(inner).toContain("<circle");
    expect(inner).toContain("<path");
    // inner children only — no wrapping <svg>
    expect(inner).not.toContain("<svg");
  });

  it("returns null for an unknown name", () => {
    expect(lucideIconResolver("not-a-real-icon")).toBeNull();
  });
});
