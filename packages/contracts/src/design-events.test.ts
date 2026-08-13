import { describe, expect, it } from "vitest";
import { DesignScreenEventKindSchema } from "./design-events";

describe("DesignScreenEventKindSchema", () => {
  it("lists exactly the seven event kinds in order", () => {
    expect(DesignScreenEventKindSchema.options).toEqual([
      "message",
      "generation_started",
      "version_created",
      "version_promoted",
      "generation_failed",
      "restored",
      "stale_candidate",
    ]);
  });

  it("rejects an unknown kind", () => {
    expect(() => DesignScreenEventKindSchema.parse("exploded")).toThrow();
  });
});
