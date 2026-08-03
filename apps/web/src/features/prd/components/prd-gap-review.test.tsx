// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PRDDocument } from "@meld/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RoomPrd } from "../schemas";
import { PrdDocument } from "./prd-document";
import { PrdGapReview } from "./prd-gap-review";

const mocks = vi.hoisted(() => ({
  acceptPrdVersion: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("../actions", () => ({
  acceptPrdVersion: mocks.acceptPrdVersion,
  savePrdVersion: vi.fn(),
}));

const document = (overrides: Partial<PRDDocument> = {}): PRDDocument => ({
  title: "Checkout redesign",
  executiveSummary: "Make checkout easier.",
  problemAndEvidence: "Customers abandon complicated flows.",
  targetUsersAndUseCases: "Returning customers.",
  goalsNonGoalsAndMetrics: "Increase completion.",
  proposedSolution: "Streamline the flow.",
  userJourneys: "Cart to confirmation.",
  functionalRequirements: ["Show order total."],
  nonFunctionalRequirements: ["Load quickly."],
  uxStatesAndEdgeCases: ["Handle expired carts."],
  dependenciesAndConstraints: ["Payments API."],
  risksAndMitigations: [
    { risk: "Payment outage", mitigation: "Show a retry path." },
  ],
  mvpScope: { included: ["Guest checkout."], excluded: ["Saved cards."] },
  acceptanceCriteria: ["Customers can pay."],
  openQuestions: [],
  decisionHistory: [
    {
      decision: "Start with cards.",
      rationale: "They cover most orders.",
      sourceMessageIds: ["10000000-0000-4000-8000-000000000001"],
    },
  ],
  ...overrides,
});

const prd = (overrides: Partial<RoomPrd> = {}): RoomPrd => ({
  id: "50000000-0000-4000-8000-000000000001",
  roomId: "40000000-0000-4000-8000-000000000004",
  version: 2,
  status: "draft",
  document: document(),
  ownerId: "10000000-0000-4000-8000-000000000001",
  createdBy: "10000000-0000-4000-8000-000000000001",
  acceptedAt: null,
  acceptedBy: null,
  createdAt: "2026-08-03T10:00:00.000Z",
  updatedAt: "2026-08-03T10:00:00.000Z",
  ...overrides,
});

function renderDocument(overrides: Partial<React.ComponentProps<typeof PrdDocument>> = {}) {
  const currentPrd = overrides.prd ?? prd();
  return render(
    <PrdDocument
      prd={currentPrd}
      ownerName="Owner"
      basePath="/organization/discovery/room"
      history={[currentPrd]}
      canEdit={false}
      canAccept
      {...overrides}
    />,
  );
}

afterEach(() => {
  cleanup();
  mocks.acceptPrdVersion.mockReset();
  mocks.refresh.mockReset();
});

describe("PrdGapReview", () => {
  it("hides the header review action while the PRD editor is active", async () => {
    const user = userEvent.setup();
    renderDocument({ canEdit: true });

    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByRole("textbox", { name: /^Title/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Review gaps" })).not.toBeInTheDocument();
  });

  it("groups warnings, reports their count, and links them to stable document sections", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onSelectSection = vi.fn();
    render(
      <PrdGapReview
        document={document({
          executiveSummary: "",
          functionalRequirements: [""],
        })}
        isOpen
        onOpenChange={onOpenChange}
        onSelectSection={onSelectSection}
      />,
    );

    expect(screen.getByText("2 review warnings")).toBeInTheDocument();
    expect(screen.getByText("Executive summary")).toBeInTheDocument();
    expect(screen.getByText("Functional requirements")).toBeInTheDocument();
    const warning = screen.getByRole("link", {
      name: "Executive summary is empty.",
    });
    expect(warning).toHaveAttribute("href", "#executive-summary");

    await user.click(warning);
    expect(onSelectSection).toHaveBeenCalledWith("executive-summary");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("uses a clear empty state when there are no review warnings", () => {
    render(
      <PrdGapReview
        document={document()}
        isOpen
        onOpenChange={vi.fn()}
        onSelectSection={vi.fn()}
      />,
    );

    expect(screen.getByText("No review warnings")).toBeInTheDocument();
  });
});

describe("PRD acceptance", () => {
  it("hides acceptance for users without owner or admin access", () => {
    renderDocument({ canAccept: false });
    expect(screen.queryByRole("button", { name: "Accept version" })).not.toBeInTheDocument();
  });

  it("requires confirmation, acknowledges warnings, and updates the current/history state after success", async () => {
    const user = userEvent.setup();
    const current = prd({ document: document({ executiveSummary: "" }) });
    const accepted = prd({
      status: "accepted",
      acceptedAt: "2026-08-03T11:00:00.000Z",
      acceptedBy: "10000000-0000-4000-8000-000000000001",
    });
    let resolveAcceptance: ((value: { status: "accepted"; prd: RoomPrd }) => void) | undefined;
    mocks.acceptPrdVersion.mockImplementation(
      () =>
        new Promise<{ status: "accepted"; prd: RoomPrd }>((resolve) => {
          resolveAcceptance = resolve;
        }),
    );
    renderDocument({ prd: current, history: [current] });

    await user.click(screen.getByRole("button", { name: "Accept version" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("Accept version v2?");
    expect(dialog).toHaveTextContent("1 review warning will remain.");
    expect(dialog).toHaveAttribute("data-purpose", "required");

    await user.click(screen.getByRole("button", { name: "Confirm acceptance" }));
    expect(screen.getByRole("button", { name: "Confirm acceptance" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(mocks.acceptPrdVersion).toHaveBeenCalledWith({
      roomId: current.roomId,
      prdId: current.id,
    });

    resolveAcceptance?.({ status: "accepted", prd: accepted });
    await waitFor(() =>
      expect(screen.getAllByText("Accepted").length).toBeGreaterThan(0),
    );
    expect(screen.queryByRole("button", { name: "Accept version" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "History" }));
    expect(screen.getByText("Last accepted")).toBeInTheDocument();
  });

  it("keeps the required confirmation open and shows an error when acceptance fails", async () => {
    const user = userEvent.setup();
    mocks.acceptPrdVersion.mockResolvedValue({
      status: "error",
      message: "Could not accept the PRD version.",
    });
    renderDocument();

    await user.click(screen.getByRole("button", { name: "Accept version" }));
    await user.click(screen.getByRole("button", { name: "Confirm acceptance" }));

    expect(await screen.findByText("Could not accept the PRD version.")).toBeInTheDocument();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
});
