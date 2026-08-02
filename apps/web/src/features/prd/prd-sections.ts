import type { PRDDocument } from "@meld/contracts";

// One entry per PRDDocument content field (everything but `title`, which is
// the page heading, not a body section). The outline nav and the section
// renderers below both walk this array, so a field can never appear twice or
// be silently dropped from the document -- prd-sections.test.ts enforces it.
export type PrdSectionKind = "prose" | "list" | "mvp" | "risks" | "decisions";

export type PrdSection = {
  id: string;
  label: string;
  field: keyof PRDDocument;
  kind: PrdSectionKind;
};

export const PRD_SECTIONS: PrdSection[] = [
  {
    id: "executive-summary",
    label: "Executive summary",
    field: "executiveSummary",
    kind: "prose",
  },
  {
    id: "problem-evidence",
    label: "Problem & evidence",
    field: "problemAndEvidence",
    kind: "prose",
  },
  {
    id: "target-users",
    label: "Target users",
    field: "targetUsersAndUseCases",
    kind: "prose",
  },
  {
    id: "goals-metrics",
    label: "Goals & metrics",
    field: "goalsNonGoalsAndMetrics",
    kind: "prose",
  },
  {
    id: "proposed-solution",
    label: "Proposed solution",
    field: "proposedSolution",
    kind: "prose",
  },
  {
    id: "user-journeys",
    label: "User journeys",
    field: "userJourneys",
    kind: "prose",
  },
  {
    id: "functional-requirements",
    label: "Functional requirements",
    field: "functionalRequirements",
    kind: "list",
  },
  {
    id: "nonfunctional-requirements",
    label: "Non-functional requirements",
    field: "nonFunctionalRequirements",
    kind: "list",
  },
  {
    id: "ux-states",
    label: "UX states & edge cases",
    field: "uxStatesAndEdgeCases",
    kind: "list",
  },
  {
    id: "dependencies",
    label: "Dependencies & constraints",
    field: "dependenciesAndConstraints",
    kind: "list",
  },
  {
    id: "mvp-scope",
    label: "MVP scope",
    field: "mvpScope",
    kind: "mvp",
  },
  {
    id: "risks",
    label: "Risks & mitigations",
    field: "risksAndMitigations",
    kind: "risks",
  },
  {
    id: "acceptance-criteria",
    label: "Acceptance criteria",
    field: "acceptanceCriteria",
    kind: "list",
  },
  {
    id: "open-questions",
    label: "Open questions",
    field: "openQuestions",
    kind: "list",
  },
  {
    id: "decision-history",
    label: "Decision history",
    field: "decisionHistory",
    kind: "decisions",
  },
];
