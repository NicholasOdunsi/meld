// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { PRDDocument } from "@meld/contracts";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrdProposal, RoomPrd } from "../schemas";
import { PrdDocument } from "./prd-document";
import { PrdEditor } from "./prd-editor";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  savePrdVersion: vi.fn(),
  listPrdProposals: vi.fn().mockResolvedValue([]),
}));

const savePrdVersionMock = mocks.savePrdVersion;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("../actions", () => ({
  savePrdVersion: mocks.savePrdVersion,
  listPrdProposals: mocks.listPrdProposals,
}));

afterEach(() => {
  cleanup();
  mocks.refresh.mockReset();
  savePrdVersionMock.mockReset();
  mocks.listPrdProposals.mockReset();
  mocks.listPrdProposals.mockResolvedValue([]);
});

const document = (): PRDDocument => ({
  title: "Checkout redesign",
  executiveSummary: "Make checkout easier.",
  problemAndEvidence: "Customers abandon complicated flows.",
  targetUsersAndUseCases: "Returning customers.",
  goalsNonGoalsAndMetrics: "Increase completion.",
  proposedSolution: "Streamline the flow.",
  userJourneys: {
    title: "Checkout journey",
    summary: "Cart to confirmation.",
    nodes: [
      { id: "start", kind: "start", label: "Open cart", detail: null },
      { id: "done", kind: "end", label: "Confirmation", detail: null },
    ],
    edges: [{ id: "e1", from: "start", to: "done", label: null }],
    openQuestions: [],
  },
  functionalRequirements: ["Show order total."],
  nonFunctionalRequirements: ["Load quickly."],
  uxStatesAndEdgeCases: ["Handle expired carts."],
  dependenciesAndConstraints: ["Payments API."],
  risksAndMitigations: [
    { risk: "Payment outage", mitigation: "Show a retry path." },
  ],
  mvpScope: { included: ["Guest checkout."], excluded: ["Saved cards."] },
  acceptanceCriteria: ["Customers can pay."],
  openQuestions: ["Which wallets should launch first?"],
  decisionHistory: [
    {
      decision: "Start with cards.",
      rationale: "They cover most orders.",
      sourceMessageIds: ["10000000-0000-4000-8000-000000000001"],
    },
  ],
});

const prd = (overrides: Partial<RoomPrd> = {}): RoomPrd => ({
  id: "50000000-0000-4000-8000-000000000001",
  roomId: "40000000-0000-4000-8000-000000000004",
  version: 1,
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

function renderEditor(overrides: Partial<ComponentProps<typeof PrdEditor>> = {}) {
  const onSaved = vi.fn();
  const onCancel = vi.fn();
  const onReviewLatest = vi.fn();
  render(
    <PrdEditor
      initialPrd={prd()}
      canEdit
      onSaved={onSaved}
      onCancel={onCancel}
      onReviewLatest={onReviewLatest}
      {...overrides}
    />,
  );
  return { onSaved, onCancel, onReviewLatest };
}

describe("PrdEditor", () => {
  it("surfaces a failed section proposal with an alternate-provider action", async () => {
    const failedProposal: PrdProposal = {
      id: "60000000-0000-4000-8000-000000000001",
      roomId: prd().roomId,
      taskId: "70000000-0000-4000-8000-000000000001",
      provider: "claude",
      basePrdId: prd().id,
      baseVersion: 1,
      sectionField: "executiveSummary",
      sectionLabel: "Executive summary",
      instruction: "Make this clearer.",
      quotedText: "Make checkout easier.",
      previousValue: "Make checkout easier.",
      proposedValue: null,
      status: "failed",
      errorMessage: "The managed claude subscription has reached its usage limit.",
      createdBy: "10000000-0000-4000-8000-000000000001",
      createdAt: "2026-08-08T11:42:37.000Z",
      updatedAt: "2026-08-08T11:42:48.000Z",
      appliedAt: null,
      discardedAt: null,
    };
    mocks.listPrdProposals.mockResolvedValue([failedProposal]);

    render(
      <PrdDocument
        prd={prd()}
        ownerName="Owner"
        basePath="/workspace/rooms/room"
        history={[prd()]}
        canEdit
        canAccept
      />,
    );

    expect(
      await screen.findByText(
        "The managed claude subscription has reached its usage limit.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try with Codex" }),
    ).toBeInTheDocument();
  });

  it("strikes the document value in place and shows only the replacement in the suggestion", async () => {
    const readyProposal: PrdProposal = {
      id: "60000000-0000-4000-8000-000000000002",
      roomId: prd().roomId,
      taskId: "70000000-0000-4000-8000-000000000002",
      provider: "codex",
      basePrdId: prd().id,
      baseVersion: 1,
      sectionField: "executiveSummary",
      sectionLabel: "Executive summary",
      instruction: "Make this clearer.",
      quotedText: "Make checkout easier.",
      previousValue: "Make checkout easier.",
      proposedValue: "Make checkout effortless.",
      status: "ready",
      errorMessage: null,
      createdBy: "10000000-0000-4000-8000-000000000001",
      createdAt: "2026-08-08T11:55:50.000Z",
      updatedAt: "2026-08-08T11:57:00.000Z",
      appliedAt: null,
      discardedAt: null,
    };
    mocks.listPrdProposals.mockResolvedValue([readyProposal]);

    render(
      <PrdDocument
        prd={prd()}
        ownerName="Owner"
        basePath="/workspace/rooms/room"
        history={[prd()]}
        canEdit
        canAccept
      />,
    );

    expect(await screen.findByText("Make checkout effortless.")).toBeInTheDocument();
    expect(screen.getAllByText("Make checkout easier.")).toHaveLength(1);
    expect(
      screen.getByText("Make checkout easier.").closest('[role="document"]'),
    ).toHaveStyle({ textDecoration: "line-through" });
  });

  it("enters edit mode only for editors", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <PrdDocument
        prd={prd()}
        ownerName="Owner"
        basePath="/workspace/rooms/room"
        history={[prd()]}
        canEdit
        canAccept
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("textbox", { name: /^Title/ })).toBeInTheDocument();

    rerender(
      <PrdDocument
        prd={prd()}
        ownerName="Owner"
        basePath="/workspace/rooms/room"
        history={[prd()]}
        canEdit={false}
        canAccept
      />,
    );
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("edits prose and list rows", () => {
    renderEditor();

    fireEvent.change(screen.getByRole("textbox", { name: "Executive summary" }), {
      target: { value: "Updated summary" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Add Functional requirements row" }),
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Functional requirements row 2" }),
      { target: { value: "Support promo codes." } },
    );

    expect(screen.getByRole("textbox", { name: "Executive summary" })).toHaveValue(
      "Updated summary",
    );
    expect(screen.getByRole("textbox", { name: "Functional requirements row 2" })).toHaveValue(
      "Support promo codes.",
    );
  });

  it("edits risk pairs", () => {
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "Add risk row" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Risk row 2" }), {
      target: { value: "Fraud" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Mitigation row 2" }), {
      target: { value: "Review orders." },
    });

    expect(screen.getByRole("textbox", { name: "Risk row 2" })).toHaveValue("Fraud");
    expect(screen.getByRole("textbox", { name: "Mitigation row 2" })).toHaveValue(
      "Review orders.",
    );
  });

  it("edits MVP scope", () => {
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "Add Included MVP row" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Included MVP row 2" }), {
      target: { value: "Order review." },
    });

    expect(screen.getByRole("textbox", { name: "Included MVP row 2" })).toHaveValue(
      "Order review.",
    );
  });

  it("keeps intentionally blank rows and supports reordering and removal", () => {
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "Add Open questions row" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Move Open questions row 2 up" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Remove Open questions row 1" }),
    );

    expect(screen.getByRole("textbox", { name: "Open questions row 1" })).toHaveValue(
      "Which wallets should launch first?",
    );
  });

  it("deletes and restores the MVP excluded subsection independently", () => {
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "Remove Excluded section" }));

    expect(
      screen.queryByRole("textbox", { name: "Excluded MVP row 1" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Excluded" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Included MVP row 1" })).toHaveValue(
      "Guest checkout.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Add Excluded" }));

    expect(screen.getByRole("textbox", { name: "Excluded MVP row 1" })).toHaveValue("");
  });

  it("deletes a section and restores it with a fresh, focused field", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(
      screen.getByRole("button", { name: "Remove Executive summary section" }),
    );
    expect(
      screen.queryByRole("textbox", { name: "Executive summary" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add Executive summary" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add Executive summary" }));
    const restored = screen.getByRole("textbox", { name: "Executive summary" });
    expect(restored).toHaveValue("");
    expect(restored).toHaveFocus();
  });

  it("adds a row on Enter and merges it away on Backspace at the start", async () => {
    renderEditor();

    const row1 = screen.getByRole("textbox", {
      name: "Functional requirements row 1",
    });
    fireEvent.keyDown(row1, { key: "Enter" });
    const row2 = await screen.findByRole("textbox", {
      name: "Functional requirements row 2",
    });
    expect(row2).toHaveValue("");
    expect(row2).toHaveFocus();

    fireEvent.keyDown(row2, { key: "Backspace" });
    expect(
      screen.queryByRole("textbox", { name: "Functional requirements row 2" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Functional requirements row 1" }),
    ).toHaveFocus();
  });

  it("hides empty sections in the read view", () => {
    render(
      <PrdDocument
        prd={prd({ document: { ...document(), executiveSummary: "" } })}
        ownerName="Owner"
        basePath="/workspace/rooms/room"
        history={[prd()]}
        canEdit
        canAccept
      />,
    );

    expect(
      screen.queryByRole("heading", { name: "Executive summary" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Problem & evidence" }),
    ).toBeInTheDocument();
  });

  it("keeps two-digit ordered-list markers on one line", () => {
    render(
      <PrdDocument
        prd={prd({
          document: {
            ...document(),
            proposedSolution: "1. First step\n2. Second step\n10. Tenth step",
          },
        })}
        ownerName="Owner"
        basePath="/workspace/rooms/room"
        history={[prd()]}
        canEdit
        canAccept
      />,
    );

    const section = window.document.querySelector(
      '[data-prd-section-field="proposedSolution"]',
    );
    expect(section).not.toBeNull();
    expect(section?.querySelector("[style]")).toHaveStyle({
      "--spacing-4": "var(--spacing-5)",
    });
    expect(screen.getByText("Tenth step")).toBeInTheDocument();
  });

  it("cancels by discarding local changes", async () => {
    const user = userEvent.setup();
    const { onCancel } = renderEditor();

    fireEvent.change(screen.getByRole("textbox", { name: /^Title/ }), {
      target: { value: "A local title" },
    });
    await user.click(screen.getAllByRole("button", { name: "Cancel" })[0]);

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("saves a dirty draft with the original version and exposes loading state", async () => {
    const user = userEvent.setup();
    let resolveSave: ((value: { status: "saved"; prd: RoomPrd }) => void) | undefined;
    savePrdVersionMock.mockImplementation(
      () =>
        new Promise<{ status: "saved"; prd: RoomPrd }>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const { onSaved, onCancel } = renderEditor();

    expect(screen.getAllByRole("button", { name: "Save changes" })[0]).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Executive summary" }), {
      target: { value: "Updated summary" },
    });
    await user.click(screen.getAllByRole("button", { name: "Save changes" })[0]);

    expect(screen.getAllByRole("button", { name: "Save changes" })[0]).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(savePrdVersionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: "40000000-0000-4000-8000-000000000004",
        baseVersion: 1,
        document: expect.objectContaining({ executiveSummary: "Updated summary" }),
      }),
    );

    resolveSave?.({ status: "saved", prd: prd({ version: 2 }) });
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("keeps a successfully saved version when the parent props are still stale", async () => {
    const user = userEvent.setup();
    const initialPrd = prd();
    const savedPrd = prd({
      // Draft saves update the existing row in place, so the version stays
      // unchanged while the database timestamp and document change.
      version: 1,
      updatedAt: "2026-08-03T10:01:00.000Z",
      document: {
        ...document(),
        title: "Saved checkout redesign",
        executiveSummary: "Updated summary",
        proposedSolution: "A saved solution.",
      },
    });
    savePrdVersionMock.mockResolvedValue({ status: "saved", prd: savedPrd });
    render(
      <PrdDocument
        prd={initialPrd}
        ownerName="Owner"
        basePath="/workspace/rooms/room"
        history={[initialPrd]}
        canEdit
        canAccept
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Executive summary" }), {
      target: { value: "Updated summary" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Proposed solution" }), {
      target: { value: "A saved solution." },
    });
    await user.click(screen.getAllByRole("button", { name: "Save changes" })[0]);

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Saved checkout redesign" }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("A saved solution.")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
  });

  it("preserves the local draft after a version conflict until the user reviews latest", async () => {
    const user = userEvent.setup();
    savePrdVersionMock.mockResolvedValue({ status: "conflict", currentVersion: 3 });
    const { onReviewLatest } = renderEditor();

    fireEvent.change(screen.getByRole("textbox", { name: "Executive summary" }), {
      target: { value: "Local draft" },
    });
    await user.click(screen.getAllByRole("button", { name: "Save changes" })[0]);

    expect(await screen.findByText("A newer version (v3) is available.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Executive summary" })).toHaveValue("Local draft");
    await user.click(screen.getByRole("button", { name: "Review latest" }));
    expect(onReviewLatest).toHaveBeenCalledOnce();
    expect(screen.getByRole("textbox", { name: "Executive summary" })).toHaveValue("Local draft");
  });

  it("shows refreshed latest content after choosing Review latest", async () => {
    const user = userEvent.setup();
    const initialPrd = prd();
    const latestPrd = prd({
      version: 3,
      document: { ...document(), title: "Latest checkout redesign" },
    });
    savePrdVersionMock.mockResolvedValue({ status: "conflict", currentVersion: 3 });
    const { rerender } = render(
      <PrdDocument
        prd={initialPrd}
        ownerName="Owner"
        basePath="/workspace/rooms/room"
        history={[initialPrd]}
        canEdit
        canAccept
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Executive summary" }), {
      target: { value: "Local draft" },
    });
    await user.click(screen.getAllByRole("button", { name: "Save changes" })[0]);
    await user.click(await screen.findByRole("button", { name: "Review latest" }));

    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(screen.queryByRole("textbox", { name: "Executive summary" })).not.toBeInTheDocument();
    rerender(
      <PrdDocument
        prd={latestPrd}
        ownerName="Owner"
        basePath="/workspace/rooms/room"
        history={[latestPrd, initialPrd]}
        canEdit
        canAccept
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Latest checkout redesign" }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("v3")).toBeInTheDocument();
  });
});
