// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PRDDocument } from "@meld/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RoomPrd } from "../schemas";
import { PrdVersionHistory } from "./prd-version-history";

const document = (overrides: Partial<PRDDocument> = {}): PRDDocument => ({
  title: "Checkout redesign",
  executiveSummary: "Make checkout easier.",
  problemAndEvidence: "Customers abandon complicated flows.",
  targetUsersAndUseCases: "Returning customers.",
  goalsNonGoalsAndMetrics: "Increase completion.",
  proposedSolution: "Streamline the flow.",
  userJourneys: null,
  functionalRequirements: ["Show order total."],
  nonFunctionalRequirements: ["Load quickly."],
  uxStatesAndEdgeCases: ["Handle expired carts."],
  dependenciesAndConstraints: ["Payments API."],
  risksAndMitigations: [],
  mvpScope: { included: ["Guest checkout."], excluded: ["Saved cards."] },
  acceptanceCriteria: ["Customers can pay."],
  openQuestions: [],
  decisionHistory: [],
  ...overrides,
});

const prd = (version: number, overrides: Partial<RoomPrd> = {}): RoomPrd => ({
  id: `50000000-0000-4000-8000-00000000000${version}`,
  roomId: "40000000-0000-4000-8000-000000000004",
  version,
  status: "draft",
  document: document(),
  ownerId: "10000000-0000-4000-8000-000000000001",
  createdBy: "10000000-0000-4000-8000-000000000001",
  acceptedAt: null,
  acceptedBy: null,
  createdAt: `2026-08-0${version}T10:00:00.000Z`,
  updatedAt: `2026-08-0${version}T10:00:00.000Z`,
  ...overrides,
});

afterEach(cleanup);

describe("PrdVersionHistory", () => {
  it("shows descending version metadata with current and last accepted labels", () => {
    const current = prd(3);
    const accepted = prd(2, {
      status: "accepted",
      acceptedAt: "2026-08-02T12:00:00.000Z",
      acceptedBy: "10000000-0000-4000-8000-000000000001",
    });
    render(
      <PrdVersionHistory
        currentPrd={current}
        history={[prd(1), accepted, current]}
        isOpen
        onOpenChange={vi.fn()}
      />,
    );

    const rows = screen.getAllByRole("button", { name: /Version v/ });
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("v3"),
      expect.stringContaining("v2"),
      expect.stringContaining("v1"),
    ]);
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getByText("Last accepted")).toBeInTheDocument();
    expect(screen.getByText("Accepted")).toBeInTheDocument();
  });

  it("compares changed sections with list-row additions and removals", () => {
    const previous = prd(1, {
      document: document({
        executiveSummary: "Original summary.",
        functionalRequirements: ["Show order total.", "Keep cart."],
      }),
    });
    const current = prd(2, {
      document: document({
        executiveSummary: "Updated summary.",
        functionalRequirements: ["Show order total.", "Support promo codes."],
      }),
    });
    render(
      <PrdVersionHistory
        currentPrd={current}
        history={[previous, current]}
        isOpen
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Executive summary changed")).toBeInTheDocument();
    expect(screen.getByText("Functional requirements: 1 added, 1 removed")).toBeInTheDocument();
  });

  it("reports an unchanged comparison when selected versions have identical documents", async () => {
    const user = userEvent.setup();
    const older = prd(1);
    const current = prd(2);
    render(
      <PrdVersionHistory
        currentPrd={current}
        history={[older, current]}
        isOpen
        onOpenChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Version v1/ }));
    expect(screen.getByText("No changes compared with v2.")).toBeInTheDocument();
  });
});
