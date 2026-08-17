import { describe, expect, it } from "vitest";
import { substituteBatchIcons, type DesignScreenBatch } from "@meld/prototype";
import { lucideIconResolver } from "./lucide-icon-resolver";

describe("design screen icon substitution (connector wiring)", () => {
  it("resolves data-icon placeholders to real lucide svg", () => {
    const batch: DesignScreenBatch = {
      screens: [
        {
          markup: '<nav><svg data-icon="search"></svg><svg data-icon="bell"></svg></nav>',
          styles: "",
          script: null,
          actions: [],
        },
      ],
    };
    const out = substituteBatchIcons(batch, lucideIconResolver);
    expect(out.screens[0].markup).not.toContain("data-icon=");
    expect(out.screens[0].markup).toContain('stroke="currentColor"');
    // real lucide geometry, not the fallback circle at r="9"
    expect(out.screens[0].markup).not.toContain('r="9"');
  });
});
