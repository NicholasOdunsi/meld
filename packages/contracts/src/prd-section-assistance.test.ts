import { describe, expect, it } from "vitest";
import {
  MAX_PRD_ASSIST_SECTIONS,
  MAX_PRD_ASSIST_SECTION_LABEL_CHARS,
  MAX_PRD_ASSIST_SECTION_QUOTE_CHARS,
  MAX_PRD_ASSIST_TOTAL_QUOTE_CHARS,
  PrdAssistScopeSchema,
  parsePrdSectionAssistance,
  type PrdAssistFieldName,
  type PrdAssistScope,
} from "./prd-section-assistance";
import { PRD_SECTION_ORDER } from "./prd-fields";

// The order the PRD is *rendered* in (apps/web `PRD_SECTIONS`), written out
// here rather than derived from the contracts package, so these tests cannot be
// satisfied by whatever ordering authority the implementation happens to pick.
// Note `mvpScope` before `risksAndMitigations`: PRDDocumentSchema declares
// those two the other way round, and a selection dragged across them is the
// case that catches ordering by declaration instead of by rendering.
const RENDERED_ORDER = [
  "executiveSummary",
  "problemAndEvidence",
  "targetUsersAndUseCases",
  "goalsNonGoalsAndMetrics",
  "proposedSolution",
  "userJourneys",
  "functionalRequirements",
  "nonFunctionalRequirements",
  "uxStatesAndEdgeCases",
  "dependenciesAndConstraints",
  "mvpScope",
  "risksAndMitigations",
  "acceptanceCriteria",
  "openQuestions",
  "decisionHistory",
] as const satisfies readonly PrdAssistFieldName[];

const ASSIST_FIELDS: readonly PrdAssistFieldName[] = RENDERED_ORDER;

const scopeOf = (
  fields: readonly PrdAssistFieldName[],
  overrides: Partial<PrdAssistScope> = {},
): PrdAssistScope => ({
  sections: fields.map((field) => ({
    field,
    label: field,
    quotedText: `selected ${field} text`,
  })),
  canProposeEdit: true,
  ...overrides,
});

const envelope = (overrides: Record<string, unknown> = {}) => ({
  answer: null,
  proposal: null,
  clarifyingQuestion: null,
  citedMessageIds: [],
  citedEvidenceIds: [],
  assumptions: [],
  suggestedNextQuestions: [],
  ...overrides,
});

const uuid = (n: number) =>
  `41000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("parsePrdSectionAssistance outcomes", () => {
  it("accepts an answer-only result", () => {
    const parsed = parsePrdSectionAssistance(
      scopeOf(["executiveSummary"]),
      envelope({
        answer: "We chose this to cut setup time.",
        citedMessageIds: [uuid(1)],
        assumptions: ["Owners onboard first."],
      }),
    );

    expect(parsed).toEqual({
      ok: true,
      value: {
        answer: "We chose this to cut setup time.",
        proposal: null,
        clarifyingQuestion: null,
        citedMessageIds: [uuid(1)],
        citedEvidenceIds: [],
        assumptions: ["Owners onboard first."],
        suggestedNextQuestions: [],
      },
    });
  });

  it("accepts a valid proposal for the only field in scope", () => {
    const parsed = parsePrdSectionAssistance(
      scopeOf(["executiveSummary"]),
      envelope({
        proposal: { targetField: "executiveSummary", value: "Tighter." },
      }),
    );

    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.value.proposal).toEqual({
      targetField: "executiveSummary",
      value: "Tighter.",
    });
    expect(parsed.ok && parsed.value.answer).toBeNull();
  });

  it("accepts one targeted proposal from a multi-section scope", () => {
    const parsed = parsePrdSectionAssistance(
      scopeOf([
        "goalsNonGoalsAndMetrics",
        "functionalRequirements",
        "risksAndMitigations",
      ]),
      envelope({
        proposal: {
          targetField: "risksAndMitigations",
          value: [{ risk: "Too many steps", mitigation: "Measure drop-off." }],
        },
      }),
    );

    expect(parsed.ok && parsed.value.proposal).toEqual({
      targetField: "risksAndMitigations",
      value: [{ risk: "Too many steps", mitigation: "Measure drop-off." }],
    });
  });

  it("accepts an answer alongside a proposal", () => {
    const parsed = parsePrdSectionAssistance(
      scopeOf(["proposedSolution"]),
      envelope({
        answer: "The rationale was buried in the second paragraph.",
        proposal: {
          targetField: "proposedSolution",
          value: "A guided setup flow, because owners stall on step one.",
        },
      }),
    );

    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.value.answer).toBe(
      "The rationale was buried in the second paragraph.",
    );
    expect(parsed.ok && parsed.value.proposal?.targetField).toBe(
      "proposedSolution",
    );
  });

  it("accepts a clarification-only result", () => {
    const parsed = parsePrdSectionAssistance(
      scopeOf(["goalsNonGoalsAndMetrics", "risksAndMitigations"]),
      envelope({
        clarifyingQuestion: "Which section should I rewrite first?",
      }),
    );

    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.value.clarifyingQuestion).toBe(
      "Which section should I rewrite first?",
    );
    expect(parsed.ok && parsed.value.answer).toBeNull();
    expect(parsed.ok && parsed.value.proposal).toBeNull();
  });

  it("rejects an all-null result", () => {
    expect(
      parsePrdSectionAssistance(scopeOf(["executiveSummary"]), envelope()),
    ).toEqual({ ok: false });
  });

  it("rejects a clarification combined with an answer or a proposal", () => {
    expect(
      parsePrdSectionAssistance(
        scopeOf(["executiveSummary"]),
        envelope({
          answer: "Here is why.",
          clarifyingQuestion: "Which section first?",
        }),
      ),
    ).toEqual({ ok: false });

    expect(
      parsePrdSectionAssistance(
        scopeOf(["executiveSummary"]),
        envelope({
          proposal: { targetField: "executiveSummary", value: "Tighter." },
          clarifyingQuestion: "Which section first?",
        }),
      ),
    ).toEqual({ ok: false });
  });
});

describe("parsePrdSectionAssistance proposal boundaries", () => {
  it("rejects a proposal targeting a field outside the selected scope", () => {
    expect(
      parsePrdSectionAssistance(
        scopeOf(["executiveSummary", "proposedSolution"]),
        envelope({
          proposal: { targetField: "problemAndEvidence", value: "Rewritten." },
        }),
      ),
    ).toEqual({ ok: false });

    expect(
      parsePrdSectionAssistance(
        scopeOf(["executiveSummary"]),
        envelope({ proposal: { targetField: "title", value: "New title" } }),
      ),
    ).toEqual({ ok: false });

    expect(
      parsePrdSectionAssistance(
        scopeOf(["executiveSummary"]),
        envelope({
          proposal: { targetField: "notASection", value: "Rewritten." },
        }),
      ),
    ).toEqual({ ok: false });
  });

  it("rejects a proposal value with the wrong shape for its target field", () => {
    expect(
      parsePrdSectionAssistance(
        scopeOf(["functionalRequirements"]),
        envelope({
          proposal: {
            targetField: "functionalRequirements",
            value: "not a list",
          },
        }),
      ),
    ).toEqual({ ok: false });

    expect(
      parsePrdSectionAssistance(
        scopeOf(["mvpScope"]),
        envelope({
          proposal: {
            targetField: "mvpScope",
            value: { included: ["Checklist"] },
          },
        }),
      ),
    ).toEqual({ ok: false });
  });

  it("rejects any proposal when the frozen scope forbids editing", () => {
    expect(
      parsePrdSectionAssistance(
        scopeOf(["executiveSummary"], { canProposeEdit: false }),
        envelope({
          proposal: { targetField: "executiveSummary", value: "Tighter." },
        }),
      ),
    ).toEqual({ ok: false });

    expect(
      parsePrdSectionAssistance(
        scopeOf(["executiveSummary"], { canProposeEdit: false }),
        envelope({ answer: "Because owners stall." }),
      ).ok,
    ).toBe(true);
  });
});

describe("PrdAssistScopeSchema", () => {
  it("orders sections the way the document is rendered", () => {
    expect([...PRD_SECTION_ORDER]).toEqual([...RENDERED_ORDER]);
  });

  it("accepts a selection of the maximum size, in rendered order", () => {
    const atMax = ASSIST_FIELDS.slice(0, MAX_PRD_ASSIST_SECTIONS);

    expect(atMax).toHaveLength(MAX_PRD_ASSIST_SECTIONS);
    expect(PrdAssistScopeSchema.safeParse(scopeOf(atMax)).success).toBe(true);
  });

  // A user can drag one selection from "MVP scope" through "Risks &
  // mitigations" because they render adjacently; PRDDocumentSchema happens to
  // declare them in the opposite order, and ordering by declaration would
  // reject the only sequence such a selection can produce.
  it("accepts an adjacent MVP-scope-then-risks selection and rejects its reverse", () => {
    expect(
      PrdAssistScopeSchema.safeParse(
        scopeOf(["mvpScope", "risksAndMitigations"]),
      ).success,
    ).toBe(true);
    expect(
      parsePrdSectionAssistance(
        scopeOf(["mvpScope", "risksAndMitigations"]),
        envelope({ answer: "Both are about scope risk." }),
      ).ok,
    ).toBe(true);

    expect(
      PrdAssistScopeSchema.safeParse(
        scopeOf(["risksAndMitigations", "mvpScope"]),
      ).success,
    ).toBe(false);
  });

  it("rejects duplicate, out-of-order, empty, oversized, or too many sections", () => {
    // duplicate fields
    expect(
      PrdAssistScopeSchema.safeParse(
        scopeOf(["executiveSummary", "executiveSummary"]),
      ).success,
    ).toBe(false);

    // out of document order
    expect(
      PrdAssistScopeSchema.safeParse(
        scopeOf(["risksAndMitigations", "executiveSummary"]),
      ).success,
    ).toBe(false);

    // no sections at all
    expect(
      PrdAssistScopeSchema.safeParse({ sections: [], canProposeEdit: true })
        .success,
    ).toBe(false);

    // an empty quote
    expect(
      PrdAssistScopeSchema.safeParse({
        sections: [
          { field: "executiveSummary", label: "Executive Summary", quotedText: "" },
        ],
        canProposeEdit: true,
      }).success,
    ).toBe(false);

    // one quote past the per-section limit
    expect(
      PrdAssistScopeSchema.safeParse({
        sections: [
          {
            field: "executiveSummary",
            label: "Executive Summary",
            quotedText: "x".repeat(MAX_PRD_ASSIST_SECTION_QUOTE_CHARS + 1),
          },
        ],
        canProposeEdit: true,
      }).success,
    ).toBe(false);

    // three legal quotes that together pass the total limit
    const chunk = "x".repeat(MAX_PRD_ASSIST_SECTION_QUOTE_CHARS - 1_000);
    expect(chunk.length * 3).toBeGreaterThan(MAX_PRD_ASSIST_TOTAL_QUOTE_CHARS);
    expect(
      PrdAssistScopeSchema.safeParse({
        sections: [
          "executiveSummary",
          "problemAndEvidence",
          "proposedSolution",
        ].map((field) => ({ field, label: field, quotedText: chunk })),
        canProposeEdit: true,
      }).success,
    ).toBe(false);

    // A label past the cap. The RPC's own section validation refuses a label
    // outside 1..MAX_PRD_ASSIST_SECTION_LABEL_CHARS, so a scope the contract
    // accepts but the database rejects would be a caller-visible 500 rather
    // than a validation error; the cap belongs here, where the shape is
    // defined, and every other layer reads it from here.
    expect(
      PrdAssistScopeSchema.safeParse({
        sections: [
          {
            field: "executiveSummary",
            label: "x".repeat(MAX_PRD_ASSIST_SECTION_LABEL_CHARS),
            quotedText: "Reassign vehicles",
          },
        ],
        canProposeEdit: true,
      }).success,
    ).toBe(true);
    expect(
      PrdAssistScopeSchema.safeParse({
        sections: [
          {
            field: "executiveSummary",
            label: "x".repeat(MAX_PRD_ASSIST_SECTION_LABEL_CHARS + 1),
            quotedText: "Reassign vehicles",
          },
        ],
        canProposeEdit: true,
      }).success,
    ).toBe(false);

    // One section past the maximum. The document has exactly 15 selectable
    // fields today, so a 16th entry necessarily repeats one -- both the count
    // cap and the uniqueness rule reject this.
    const pastMax = [
      ...ASSIST_FIELDS.slice(0, MAX_PRD_ASSIST_SECTIONS),
      ASSIST_FIELDS[0],
    ];
    expect(pastMax.length).toBe(MAX_PRD_ASSIST_SECTIONS + 1);
    expect(PrdAssistScopeSchema.safeParse(scopeOf(pastMax)).success).toBe(false);
  });

  it("refuses to parse a result against an invalid scope", () => {
    expect(
      parsePrdSectionAssistance(
        scopeOf(["risksAndMitigations", "executiveSummary"]),
        envelope({ answer: "Because owners stall." }),
      ),
    ).toEqual({ ok: false });
  });
});

describe("PrdSectionAssistEnvelopeSchema strictness", () => {
  it("rejects extra keys, including a second PRD field", () => {
    expect(
      parsePrdSectionAssistance(
        scopeOf(["executiveSummary"]),
        envelope({
          answer: "Because owners stall.",
          mvpScope: { included: ["Checklist"], excluded: [] },
        }),
      ),
    ).toEqual({ ok: false });

    expect(
      parsePrdSectionAssistance(
        scopeOf(["executiveSummary"]),
        envelope({
          proposal: {
            targetField: "executiveSummary",
            value: "Tighter.",
            functionalRequirements: ["Sneaky second field."],
          },
        }),
      ).ok,
    ).toBe(false);

    expect(
      parsePrdSectionAssistance(
        scopeOf(["executiveSummary"]),
        envelope({ answer: "Because owners stall.", intent: "edit" }),
      ),
    ).toEqual({ ok: false });
  });

  // Claude re-validates every structured-output call against the schema it was
  // given and answers a miss with a bare "must have required property
  // 'citedMessageIds'". Told the same thing again on the retry, the model omits
  // the key again, burns the whole retry budget, and a complete result is
  // thrown away over an absent pair of brackets -- the failure
  // RoomReplyResultSchema's defaults already exist to prevent. So an omitted
  // key here means exactly the value the model would have sent.
  it("reads an omitted list as [] and an omitted outcome slot as null", () => {
    const parsed = parsePrdSectionAssistance(scopeOf(["executiveSummary"]), {
      answer: "Because owners stall.",
    });

    expect(parsed).toEqual({
      ok: true,
      value: {
        answer: "Because owners stall.",
        proposal: null,
        clarifyingQuestion: null,
        citedMessageIds: [],
        citedEvidenceIds: [],
        assumptions: [],
        suggestedNextQuestions: [],
      },
    });
  });

  it("accepts a result that sends only the outcome slot it used", () => {
    expect(
      parsePrdSectionAssistance(scopeOf(["executiveSummary"]), {
        proposal: { targetField: "executiveSummary", value: "Tighter." },
      }),
    ).toEqual({
      ok: true,
      value: {
        answer: null,
        proposal: { targetField: "executiveSummary", value: "Tighter." },
        clarifyingQuestion: null,
        citedMessageIds: [],
        citedEvidenceIds: [],
        assumptions: [],
        suggestedNextQuestions: [],
      },
    });
  });

  // Defaulting the keys must not default the *outcome*: a result that says
  // nothing is still nothing.
  it("still rejects an envelope that omits every key", () => {
    expect(parsePrdSectionAssistance(scopeOf(["executiveSummary"]), {})).toEqual(
      { ok: false },
    );
  });

  // A default fills an absent key; it never rescues a present but wrong one.
  it("still rejects a supplied key whose value is the wrong type", () => {
    expect(
      parsePrdSectionAssistance(scopeOf(["executiveSummary"]), {
        answer: "Because owners stall.",
        citedMessageIds: "not-a-list",
      }),
    ).toEqual({ ok: false });
  });

  it("rejects an oversized answer, clarification, assumption, or citation list", () => {
    const scope = scopeOf(["executiveSummary"]);

    expect(
      parsePrdSectionAssistance(
        scope,
        envelope({ answer: "a".repeat(20_001) }),
      ),
    ).toEqual({ ok: false });

    expect(
      parsePrdSectionAssistance(
        scope,
        envelope({ clarifyingQuestion: "q".repeat(2_001) }),
      ),
    ).toEqual({ ok: false });

    expect(
      parsePrdSectionAssistance(
        scope,
        envelope({
          answer: "Because owners stall.",
          assumptions: Array.from({ length: 21 }, (_, i) => `assumption ${i}`),
        }),
      ),
    ).toEqual({ ok: false });

    expect(
      parsePrdSectionAssistance(
        scope,
        envelope({
          answer: "Because owners stall.",
          assumptions: ["a".repeat(2_001)],
        }),
      ),
    ).toEqual({ ok: false });

    expect(
      parsePrdSectionAssistance(
        scope,
        envelope({
          answer: "Because owners stall.",
          citedMessageIds: Array.from({ length: 101 }, (_, i) => uuid(i + 1)),
        }),
      ),
    ).toEqual({ ok: false });

    expect(
      parsePrdSectionAssistance(
        scope,
        envelope({
          answer: "Because owners stall.",
          citedEvidenceIds: ["not-a-uuid"],
        }),
      ),
    ).toEqual({ ok: false });

    expect(
      parsePrdSectionAssistance(
        scope,
        envelope({
          answer: "Because owners stall.",
          suggestedNextQuestions: ["a", "b", "c", "d", "e", "f"],
        }),
      ),
    ).toEqual({ ok: false });
  });

  // Observed against the managed Claude client on RoomReplyResultSchema: a
  // model told a slot may be empty writes "" rather than null. A blank slot
  // means "not present" here, so a perfectly good proposal is not lost to it --
  // and a result that is blank everywhere still fails as all-null.
  it("reads a blank answer or clarification as absent", () => {
    const parsed = parsePrdSectionAssistance(
      scopeOf(["executiveSummary"]),
      envelope({
        answer: "   ",
        clarifyingQuestion: "",
        proposal: { targetField: "executiveSummary", value: "Tighter." },
      }),
    );

    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.value.answer).toBeNull();
    expect(parsed.ok && parsed.value.clarifyingQuestion).toBeNull();

    expect(
      parsePrdSectionAssistance(
        scopeOf(["executiveSummary"]),
        envelope({ answer: "  ", clarifyingQuestion: "" }),
      ),
    ).toEqual({ ok: false });
  });
});
