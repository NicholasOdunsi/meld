import type { PRDDocument } from "@meld/contracts";
import { describe, expect, it } from "vitest";
import { prdDocumentToMarkdown } from "./prd-markdown";

const emptyDocument: PRDDocument = {
  title: "Checkout redesign",
  executiveSummary: "",
  problemAndEvidence: "",
  targetUsersAndUseCases: "",
  goalsNonGoalsAndMetrics: "",
  proposedSolution: "",
  userJourneys: null,
  functionalRequirements: [],
  nonFunctionalRequirements: [],
  uxStatesAndEdgeCases: [],
  dependenciesAndConstraints: [],
  risksAndMitigations: [],
  mvpScope: { included: [], excluded: [] },
  acceptanceCriteria: [],
  openQuestions: [],
  decisionHistory: [],
};

describe("prdDocumentToMarkdown user-journeys flow", () => {
  it("serializes the flow as node labels and their transitions", () => {
    const markdown = prdDocumentToMarkdown({
      ...emptyDocument,
      userJourneys: {
        title: "Checkout journey",
        summary: "Cart to confirmation.",
        nodes: [
          { id: "start", kind: "start", label: "Open cart", detail: null },
          { id: "pay", kind: "action", label: "Pay", detail: null },
          { id: "done", kind: "end", label: "Confirmation", detail: null },
        ],
        edges: [
          { id: "e1", from: "start", to: "pay", label: null },
          { id: "e2", from: "pay", to: "done", label: "success" },
        ],
        openQuestions: [],
      },
    });

    expect(markdown).toContain("## User journeys");
    expect(markdown).toContain("- Open cart");
    expect(markdown).toContain("- Open cart → Pay");
    expect(markdown).toContain("- Pay → Confirmation (success)");
  });

  it("serializes a prose user-journeys section as its text", () => {
    const markdown = prdDocumentToMarkdown({
      ...emptyDocument,
      userJourneys: "A shopper reviews costs and completes payment.",
    });
    expect(markdown).toContain("## User journeys");
    expect(markdown).toContain("A shopper reviews costs and completes payment.");
  });

  it("omits the user-journeys section when the flow is absent", () => {
    expect(prdDocumentToMarkdown(emptyDocument)).not.toContain("## User journeys");
    expect(
      prdDocumentToMarkdown({ ...emptyDocument, userJourneys: "   " }),
    ).not.toContain("## User journeys");
  });
});
