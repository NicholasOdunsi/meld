import { describe, expect, it } from "vitest";
import type { PRDDocument } from "@meld/contracts";
import { findPrdGaps } from "./prd-review";

const completePrdDocument = (): PRDDocument => ({
  title: "Checkout redesign",
  executiveSummary: "A summary.",
  problemAndEvidence: "A problem.",
  targetUsersAndUseCases: "Users.",
  goalsNonGoalsAndMetrics: "Goals.",
  proposedSolution: "A solution.",
  userJourneys: "A journey.",
  functionalRequirements: ["A requirement."],
  nonFunctionalRequirements: ["A constraint."],
  uxStatesAndEdgeCases: ["An edge case."],
  dependenciesAndConstraints: ["A dependency."],
  risksAndMitigations: [{ risk: "A risk.", mitigation: "A mitigation." }],
  mvpScope: { included: ["Included."], excluded: ["Excluded."] },
  acceptanceCriteria: ["A criterion."],
  openQuestions: [],
  decisionHistory: [
    {
      decision: "A decision.",
      rationale: "A rationale.",
      sourceMessageIds: ["00000000-0000-4000-8000-000000000001"],
    },
  ],
});

describe("findPrdGaps", () => {
  it("flags blank prose and list rows without changing the document", () => {
    const document = {
      ...completePrdDocument(),
      executiveSummary: "  ",
      functionalRequirements: ["Valid", "   "],
    };

    expect(findPrdGaps(document)).toEqual([
      {
        id: "executive-summary",
        sectionId: "executive-summary",
        message: "Executive summary is empty.",
      },
      {
        id: "functional-requirements-1",
        sectionId: "functional-requirements",
        message: "Functional requirements row 2 is empty.",
      },
    ]);
    expect(document.executiveSummary).toBe("  ");
  });

  it("flags missing risk and mitigation values", () => {
    const gaps = findPrdGaps({
      ...completePrdDocument(),
      risksAndMitigations: [{ risk: "  ", mitigation: "  " }],
    });

    expect(gaps).toEqual([
      {
        id: "risks-0-risk",
        sectionId: "risks",
        message: "Risk row 1 is empty.",
      },
      {
        id: "risks-0-mitigation",
        sectionId: "risks",
        message: "Mitigation row 1 is empty.",
      },
    ]);
  });

  it("flags empty MVP rows and incomplete decisions", () => {
    const gaps = findPrdGaps({
      ...completePrdDocument(),
      mvpScope: { included: [""], excluded: ["  "] },
      decisionHistory: [
        {
          decision: "",
          rationale: "Reason",
          sourceMessageIds: [],
        },
      ],
    });

    expect(gaps.map(({ sectionId, message }) => ({ sectionId, message }))).toEqual([
      { sectionId: "mvp-scope", message: "Included MVP row 1 is empty." },
      { sectionId: "mvp-scope", message: "Excluded MVP row 1 is empty." },
      { sectionId: "decision-history", message: "Decision row 1 is missing a decision." },
      { sectionId: "decision-history", message: "Decision row 1 is missing a source link." },
    ]);
  });

  it("flags an open question without treating it as a schema error", () => {
    const gaps = findPrdGaps({ ...completePrdDocument(), openQuestions: [""] });
    expect(gaps).toEqual([
      expect.objectContaining({
        id: "open-questions-0",
        sectionId: "open-questions",
        message: "Open question row 1 needs follow-up.",
      }),
    ]);
  });

  it("warns for every non-empty open question", () => {
    const gaps = findPrdGaps({
      ...completePrdDocument(),
      openQuestions: ["Should we support guests?", "What is the launch date?"],
    });
    expect(gaps).toHaveLength(2);
    expect(gaps.map((gap) => gap.id)).toEqual(["open-questions-0", "open-questions-1"]);
  });
});
