import { describe, expect, it } from "vitest";
import { RoomReplyResultSchema } from "./ai";

const base = {
  response: "Sure.",
  citedMessageIds: [],
  citedEvidenceIds: [],
  assumptions: [],
  suggestedNextQuestions: [],
};

describe("RoomReplyResultSchema.proposedAction", () => {
  it("accepts a reply with no proposedAction (back-compat)", () => {
    expect(RoomReplyResultSchema.parse(base).proposedAction ?? null).toBeNull();
  });

  it("accepts an explicit null proposedAction", () => {
    expect(
      RoomReplyResultSchema.parse({ ...base, proposedAction: null })
        .proposedAction,
    ).toBeNull();
  });

  it("accepts a prd_generate proposal", () => {
    const parsed = RoomReplyResultSchema.parse({
      ...base,
      proposedAction: { kind: "prd_generate" },
    });

    expect(parsed.proposedAction?.kind).toBe("prd_generate");
  });

  it("rejects an unknown action kind", () => {
    expect(() =>
      RoomReplyResultSchema.parse({
        ...base,
        proposedAction: { kind: "delete_room" },
      }),
    ).toThrow();
  });
});
