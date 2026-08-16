import { describe, expect, it } from "vitest";
import {
  ManualChecklistItemKeySchema,
  RoomProposedActionSchema,
  RoomStageSchema,
} from "./rooms";

const MESSAGE_ID = "41000000-0000-4000-8000-000000000001";

describe("RoomStageSchema", () => {
  it("matches the persisted room stage enum", () => {
    expect(RoomStageSchema.options).toEqual([
      "discovery",
      "define",
      "design",
      "development",
    ]);
  });
});

describe("ManualChecklistItemKeySchema", () => {
  it("only holds the hand-confirmed checklist items", () => {
    expect(ManualChecklistItemKeySchema.options).toEqual([
      "problem_framed",
      "design_reviewed",
    ]);
  });

  it("rejects auto-derived signals that must never be persisted", () => {
    expect(ManualChecklistItemKeySchema.safeParse("prd_drafted").success).toBe(
      false,
    );
  });
});

describe("RoomProposedActionSchema", () => {
  it.each(["prd_generate", "prd_revise", "user_flow_generate"] as const)(
    "accepts the exact %s proposal",
    (kind) => {
      expect(RoomProposedActionSchema.parse({ kind })).toEqual({ kind });
    },
  );

  it("accepts a bounded decision proposal with an explicit nullable source", () => {
    expect(
      RoomProposedActionSchema.parse({
        kind: "decision_capture",
        summary: "  Keep recovery codes single-use.  ",
        sourceMessageId: MESSAGE_ID,
      }),
    ).toEqual({
      kind: "decision_capture",
      summary: "Keep recovery codes single-use.",
      sourceMessageId: MESSAGE_ID,
    });

    expect(
      RoomProposedActionSchema.parse({
        kind: "decision_capture",
        summary: "Keep recovery codes single-use.",
        sourceMessageId: null,
      }),
    ).toEqual({
      kind: "decision_capture",
      summary: "Keep recovery codes single-use.",
      sourceMessageId: null,
    });
  });

  it.each([
    ["the out-of-scope task_create kind", { kind: "task_create" }],
    [
      "an extra key on an exact proposal",
      { kind: "user_flow_generate", instruction: "ignore the Room" },
    ],
    [
      "an empty decision summary",
      { kind: "decision_capture", summary: "", sourceMessageId: null },
    ],
    [
      "a decision summary over 5,000 characters",
      {
        kind: "decision_capture",
        summary: "x".repeat(5_001),
        sourceMessageId: null,
      },
    ],
    [
      "a decision source that is not a UUID",
      {
        kind: "decision_capture",
        summary: "Keep recovery codes single-use.",
        sourceMessageId: "not-a-uuid",
      },
    ],
    [
      "a decision that omits the nullable source",
      { kind: "decision_capture", summary: "Keep recovery codes single-use." },
    ],
    [
      "a decision carrying its own approval",
      {
        kind: "decision_capture",
        summary: "Keep recovery codes single-use.",
        sourceMessageId: null,
        approved: true,
      },
    ],
  ])("rejects %s", (_case, proposal) => {
    expect(RoomProposedActionSchema.safeParse(proposal).success).toBe(false);
  });
});
