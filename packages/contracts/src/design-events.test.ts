import { describe, expect, it } from "vitest";
import { DesignScreenEventKindSchema, DesignScreenEventSchema } from "./design-events";

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

describe("DesignScreenEventSchema", () => {
  const base = {
    id: "11111111-1111-4111-8111-111111111111",
    roomId: "22222222-2222-4222-8222-222222222222",
    screenId: null,
    kind: "generation_started",
    messageId: null,
    taskId: null,
    versionId: null,
    actor: null,
    createdAt: "2026-08-14T10:00:00.000Z",
  };
  it("parses a well-formed event", () => {
    expect(DesignScreenEventSchema.parse(base).kind).toBe("generation_started");
  });
  it("accepts a screen-scoped event", () => {
    expect(DesignScreenEventSchema.parse({ ...base, screenId: "33333333-3333-4333-8333-333333333333" }).screenId)
      .toBe("33333333-3333-4333-8333-333333333333");
  });
  it("rejects an unknown kind", () => {
    expect(DesignScreenEventSchema.safeParse({ ...base, kind: "nope" }).success).toBe(false);
  });
  it("rejects extra keys", () => {
    expect(DesignScreenEventSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });
});
