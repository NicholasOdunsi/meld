// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { PRDDocument } from "@meld/contracts";
import type { RoomPrd } from "../schemas";

vi.mock("../actions", () => ({
  acceptPrdVersion: vi.fn(),
  autosavePrdDocument: vi.fn(),
}));

vi.mock("./document-header", () => ({
  DocumentHeader: () => null,
}));

vi.mock("./freeform-document-editor", () => ({
  FreeformDocumentEditor: ({
    document,
    canEdit,
  }: {
    document: { title: string };
    canEdit: boolean;
  }) => (
    <p data-testid="freeform-editor" data-editable={String(canEdit)}>
      {document.title}
    </p>
  ),
}));

vi.mock("./prd-outline-rail", () => ({
  PrdOutlineRail: () => null,
}));

import { FreeformDocumentSurface } from "./freeform-document-surface";

afterEach(cleanup);

function legacyDocument(title: string): PRDDocument {
  return {
    title,
    executiveSummary: "Summary",
    problemAndEvidence: "Problem",
    targetUsersAndUseCases: "Users",
    goalsNonGoalsAndMetrics: "Goals",
    proposedSolution: "Solution",
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
}

function prd(version: number, title: string, status: "draft" | "accepted"): RoomPrd {
  return {
    id: `50000000-0000-4000-8000-00000000000${version}`,
    roomId: "40000000-0000-4000-8000-000000000004",
    version,
    status,
    document: legacyDocument(title),
    ownerId: "10000000-0000-4000-8000-000000000001",
    createdBy: "10000000-0000-4000-8000-000000000001",
    acceptedAt: status === "accepted" ? "2026-08-21T10:00:00.000Z" : null,
    acceptedBy:
      status === "accepted"
        ? "10000000-0000-4000-8000-000000000001"
        : null,
    createdAt: "2026-08-21T10:00:00.000Z",
    updatedAt: `2026-08-21T10:0${version}:00.000Z`,
  };
}

it("adopts a newer server revision in the already-open document", () => {
  const common = {
    roomId: "40000000-0000-4000-8000-000000000004",
    ownerName: "Ada",
    canEdit: true,
    canAccept: false,
  };
  const { rerender } = render(
    <FreeformDocumentSurface
      {...common}
      prd={prd(1, "Vehicle ownership transfer", "accepted")}
    />,
  );

  expect(screen.getByTestId("freeform-editor")).toHaveTextContent(
    "Vehicle ownership transfer",
  );
  expect(screen.getByTestId("freeform-editor")).toHaveAttribute(
    "data-editable",
    "false",
  );

  rerender(
    <FreeformDocumentSurface
      {...common}
      prd={prd(2, "Vehicle collection transfer", "draft")}
    />,
  );

  expect(screen.getByTestId("freeform-editor")).toHaveTextContent(
    "Vehicle collection transfer",
  );
  expect(screen.getByTestId("freeform-editor")).toHaveAttribute(
    "data-editable",
    "true",
  );
});

it("leaves room under the document for the composer floating over it", () => {
  // The dock floats above the bottom of the plane, so a document that ends
  // flush with its own scroll range hides its last lines behind the composer
  // with nothing left to scroll. The surface reserves that height itself.
  render(
    <FreeformDocumentSurface
      roomId="40000000-0000-4000-8000-000000000004"
      ownerName="Ada"
      canEdit
      canAccept={false}
      prd={prd(1, "Vehicle ownership transfer", "draft")}
    />,
  );

  const surface = screen.getByTestId("freeform-document-surface");
  expect(surface.style.paddingBottom).toBe("var(--meld-dock-clearance)");
});
