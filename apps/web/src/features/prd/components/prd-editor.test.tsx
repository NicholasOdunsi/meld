// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { PRDDocument } from "@meld/contracts";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RoomPrd } from "../schemas";
import { PrdDocument } from "./prd-document";
import { PrdEditor } from "./prd-editor";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  savePrdVersion: vi.fn(),
}));

const savePrdVersionMock = mocks.savePrdVersion;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("../actions", () => ({
  savePrdVersion: mocks.savePrdVersion,
}));

afterEach(() => {
  cleanup();
  mocks.refresh.mockReset();
  savePrdVersionMock.mockReset();
});

const document = (): PRDDocument => ({
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
  it("enters edit mode only for editors", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <PrdDocument
        prd={prd()}
        ownerName="Owner"
        basePath="/organization/discovery/room"
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
        basePath="/organization/discovery/room"
        history={[prd()]}
        canEdit={false}
        canAccept
      />,
    );
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("edits prose, list rows, risk pairs, and MVP scope", async () => {
    const user = userEvent.setup();
    renderEditor();

    fireEvent.change(screen.getByRole("textbox", { name: "Executive summary" }), {
      target: { value: "Updated summary" },
    });
    await user.click(
      screen.getByRole("button", { name: "Add Functional requirements row" }),
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Functional requirements row 2" }),
      { target: { value: "Support promo codes." } },
    );
    await user.click(screen.getByRole("button", { name: "Add risk row" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Risk row 2" }), {
      target: { value: "Fraud" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Mitigation row 2" }), {
      target: { value: "Review orders." },
    });
    await user.click(screen.getByRole("button", { name: "Add Included MVP row" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Included MVP row 2" }), {
      target: { value: "Order review." },
    });

    expect(screen.getByRole("textbox", { name: "Executive summary" })).toHaveValue(
      "Updated summary",
    );
    expect(screen.getByRole("textbox", { name: "Functional requirements row 2" })).toHaveValue(
      "Support promo codes.",
    );
    expect(screen.getByRole("textbox", { name: "Risk row 2" })).toHaveValue("Fraud");
    expect(screen.getByRole("textbox", { name: "Included MVP row 2" })).toHaveValue(
      "Order review.",
    );
  });

  it("keeps intentionally blank rows for gap review and supports reordering and removal", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: "Add Open questions row" }));
    expect(screen.getByText("Open question row 2 needs follow-up.")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Move Open questions row 2 up" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Remove Open questions row 1" }),
    );

    expect(screen.getByRole("textbox", { name: "Open questions row 1" })).toHaveValue(
      "Which wallets should launch first?",
    );
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
      version: 2,
      document: { ...document(), title: "Saved checkout redesign" },
    });
    savePrdVersionMock.mockResolvedValue({ status: "saved", prd: savedPrd });
    render(
      <PrdDocument
        prd={initialPrd}
        ownerName="Owner"
        basePath="/organization/discovery/room"
        history={[initialPrd]}
        canEdit
        canAccept
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Executive summary" }), {
      target: { value: "Updated summary" },
    });
    await user.click(screen.getAllByRole("button", { name: "Save changes" })[0]);

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Saved checkout redesign" }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("v2")).toBeInTheDocument();
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
        basePath="/organization/discovery/room"
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
        basePath="/organization/discovery/room"
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
