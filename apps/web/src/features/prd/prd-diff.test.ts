import { describe, expect, it } from "vitest";
import type { PRDDocument } from "@meld/contracts";
import { diffPrdDocuments } from "./prd-diff";

const completePrdDocument = (): PRDDocument => ({
  title: "Checkout redesign", executiveSummary: "Summary", problemAndEvidence: "Problem",
  targetUsersAndUseCases: "Users", goalsNonGoalsAndMetrics: "Goals", proposedSolution: "Solution",
  userJourneys: "Journeys", functionalRequirements: ["Requirement"],
  nonFunctionalRequirements: ["Constraint"], uxStatesAndEdgeCases: ["Edge case"],
  dependenciesAndConstraints: ["Dependency"], risksAndMitigations: [{ risk: "Risk", mitigation: "Mitigation" }],
  mvpScope: { included: ["Included"], excluded: ["Excluded"] }, acceptanceCriteria: ["Criterion"],
  openQuestions: [], decisionHistory: [],
});

describe("diffPrdDocuments", () => {
  it("reports only changed sections", () => {
    const before = completePrdDocument();
    const after = { ...before, executiveSummary: "Updated" };
    expect(diffPrdDocuments(before, after)).toEqual([
      {
        sectionId: "executive-summary",
        label: "Executive summary",
        before: "Summary",
        after: "Updated",
      },
    ]);
  });

  it("reports list, risk, MVP, and title changes with values intact", () => {
    const before = completePrdDocument();
    const after = {
      ...before,
      title: "New title",
      functionalRequirements: ["Requirement", "Added"],
      risksAndMitigations: [{ risk: "New risk", mitigation: "New mitigation" }],
      mvpScope: { included: ["Updated"], excluded: ["Excluded"] },
    };
    expect(diffPrdDocuments(before, after)).toEqual([
      { sectionId: "title", label: "Title", before: "Checkout redesign", after: "New title" },
      { sectionId: "functional-requirements", label: "Functional requirements", before: ["Requirement"], after: ["Requirement", "Added"] },
      { sectionId: "mvp-scope", label: "MVP scope", before: { included: ["Included"], excluded: ["Excluded"] }, after: { included: ["Updated"], excluded: ["Excluded"] } },
      { sectionId: "risks", label: "Risks & mitigations", before: [{ risk: "Risk", mitigation: "Mitigation" }], after: [{ risk: "New risk", mitigation: "New mitigation" }] },
    ]);
  });

  it("returns no changes for identical documents", () => {
    const document = completePrdDocument();
    expect(diffPrdDocuments(document, document)).toEqual([]);
  });
});
