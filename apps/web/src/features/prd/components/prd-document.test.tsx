// @vitest-environment jsdom

import type { PRDDocument } from "@meld/contracts";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrdAssistRequest, PrdProposal, RoomPrd } from "../schemas";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  assistPrdSection: vi.fn(),
  revisePrdSection: vi.fn(),
  getPrdAssistRequest: vi.fn(),
  listPrdAssistRequests: vi.fn(),
  dismissPrdAssistRequest: vi.fn(),
  listPrdProposals: vi.fn(),
  applyPrdProposal: vi.fn(),
  discardPrdProposal: vi.fn(),
  acceptPrdVersion: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }),
}));

vi.mock("../actions", () => ({
  assistPrdSection: mocks.assistPrdSection,
  revisePrdSection: mocks.revisePrdSection,
  getPrdAssistRequest: mocks.getPrdAssistRequest,
  listPrdAssistRequests: mocks.listPrdAssistRequests,
  dismissPrdAssistRequest: mocks.dismissPrdAssistRequest,
  listPrdProposals: mocks.listPrdProposals,
  applyPrdProposal: mocks.applyPrdProposal,
  discardPrdProposal: mocks.discardPrdProposal,
  acceptPrdVersion: mocks.acceptPrdVersion,
}));

vi.mock("@astryxdesign/core/Toast", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useToast: () => mocks.toast,
}));

import { PrdDocument } from "./prd-document";
import { RoomTaskStatusProvider } from "./room-task-status-provider";

const ROOM_ID = "40000000-0000-4000-8000-000000000001";
const PRD_ID = "50000000-0000-4000-8000-000000000001";
const USER_ID = "10000000-0000-4000-8000-000000000001";
const TASK_ID = "70000000-0000-4000-8000-000000000001";
const REQUEST_ID = "80000000-0000-4000-8000-000000000001";
const PROPOSAL_ID = "a0000000-0000-4000-8000-000000000001";
const BASE_PATH = "/org/discovery/room";
const COMPOSER_PROMPT = "Ask about this or request a change...";

const document_: PRDDocument = {
  title: "Checkout redesign",
  executiveSummary: "Reduce checkout friction while preserving trust.",
  problemAndEvidence: "Customers abandon checkout when costs appear late.",
  targetUsersAndUseCases: "Returning shoppers on mobile.",
  goalsNonGoalsAndMetrics: "Increase completed checkouts.",
  proposedSolution: "Show a concise order summary throughout checkout.",
  userJourneys: "",
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

const prd: RoomPrd = {
  id: PRD_ID,
  roomId: ROOM_ID,
  version: 3,
  status: "draft",
  document: document_,
  ownerId: USER_ID,
  createdBy: USER_ID,
  acceptedAt: null,
  acceptedBy: null,
  createdAt: "2026-08-08T10:00:00.000Z",
  updatedAt: "2026-08-08T10:00:00.000Z",
};

function assistRequest(
  overrides: Partial<PrdAssistRequest> = {},
): PrdAssistRequest {
  return {
    id: REQUEST_ID,
    roomId: ROOM_ID,
    taskId: TASK_ID,
    clientRequestId: "90000000-0000-4000-8000-000000000001",
    basePrdId: PRD_ID,
    baseVersion: 3,
    selectedSections: [
      {
        field: "executiveSummary",
        label: "Executive summary",
        quotedText: "Reduce checkout friction while preserving trust.",
      },
    ],
    instruction: "Why did we choose this?",
    canProposeEdit: true,
    status: "pending",
    answer: null,
    clarifyingQuestion: null,
    citedMessageIds: [],
    citedEvidenceIds: [],
    assumptions: [],
    suggestedNextQuestions: [],
    proposalId: null,
    proposalErrorCode: null,
    errorCode: null,
    questionMessageId: null,
    answerMessageId: null,
    provider: "codex",
    taskStatus: "queued",
    createdBy: USER_ID,
    createdAt: "2026-08-08T10:00:00.000Z",
    updatedAt: "2026-08-08T10:00:00.000Z",
    settledAt: null,
    ...overrides,
  };
}

function readyProposal(overrides: Partial<PrdProposal> = {}): PrdProposal {
  return {
    id: PROPOSAL_ID,
    roomId: ROOM_ID,
    taskId: TASK_ID,
    provider: "codex",
    basePrdId: PRD_ID,
    baseVersion: 3,
    sectionField: "executiveSummary",
    sectionLabel: "Executive summary",
    instruction: "Rewrite this for small teams.",
    quotedText: "Reduce checkout friction while preserving trust.",
    previousValue: document_.executiveSummary,
    proposedValue: "Cut checkout friction for small teams.",
    status: "ready",
    errorMessage: null,
    createdBy: USER_ID,
    createdAt: "2026-08-08T10:00:00.000Z",
    updatedAt: "2026-08-08T10:00:00.000Z",
    appliedAt: null,
    discardedAt: null,
    ...overrides,
  };
}

function renderDocument({ canEdit = true } = {}) {
  const user = userEvent.setup();
  const view = render(
    // The provider is what recovers the reader's earlier requests on mount, so
    // the document is exercised inside it rather than bare.
    <RoomTaskStatusProvider
      roomId={ROOM_ID}
      hasPrd
      fetchTaskStatuses={vi.fn().mockResolvedValue([])}
    >
      <PrdDocument
        prd={prd}
        ownerName="Ada"
        basePath={BASE_PATH}
        history={[prd]}
        canEdit={canEdit}
        canAccept={false}
      />
    </RoomTaskStatusProvider>,
  );
  return { user, view };
}

// The section wrappers carry data-prd-section-field, which is what
// resolvePrdSelection walks.
function sectionElement(field: string): Element {
  const section = window.document.querySelector(
    `[data-prd-section-field="${field}"]`,
  );
  if (!section) throw new Error(`No rendered section for ${field}`);
  return section;
}

function bodyTextNode(field: string, needle: string): Text {
  const walker = window.document.createTreeWalker(
    sectionElement(field),
    NodeFilter.SHOW_TEXT,
  );
  let node = walker.nextNode();
  while (node) {
    if (node.textContent?.includes(needle)) return node as Text;
    node = walker.nextNode();
  }
  throw new Error(`No text node containing "${needle}" in ${field}`);
}

// Selecting whole body text nodes is the closest jsdom gets to a drag.
function selectBetween(start: Text, end: Text, direction: "forward" | "backward") {
  const selection = window.getSelection();
  selection?.removeAllRanges();
  if (direction === "forward") {
    selection?.setBaseAndExtent(start, 0, end, end.data.length);
  } else {
    selection?.setBaseAndExtent(end, end.data.length, start, 0);
  }
}

function openComposer(
  field = "executiveSummary",
  needle = "Reduce checkout friction",
) {
  const node = bodyTextNode(field, needle);
  selectBetween(node, node, "forward");
  fireEvent.mouseUp(sectionElement(field));
  return screen.findByTestId("prd-selection-composer");
}

const input = () => screen.getByRole("combobox", { name: COMPOSER_PROMPT });

async function ask(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(input(), text);
  await user.click(screen.getByRole("button", { name: "Send" }));
}

// jsdom implements Range but not its layout, and the popover anchors to the
// selection's bounding box. Zeroes are the honest stand-in: this suite is
// about what the popover does, not where it sits.
beforeEach(() => {
  Range.prototype.getBoundingClientRect = () =>
    ({ top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0 }) as DOMRect;
  vi.clearAllMocks();
  mocks.listPrdProposals.mockResolvedValue([]);
  mocks.listPrdAssistRequests.mockResolvedValue([]);
  mocks.getPrdAssistRequest.mockResolvedValue(null);
  mocks.dismissPrdAssistRequest.mockResolvedValue(undefined);
  mocks.assistPrdSection.mockResolvedValue({
    status: "queued",
    taskId: TASK_ID,
    requestId: REQUEST_ID,
  });
});

afterEach(() => {
  cleanup();
  window.getSelection()?.removeAllRanges();
});

describe("PrdDocument contextual assistance", () => {
  it("opens one composer as soon as text is selected", async () => {
    renderDocument();

    expect(screen.queryByTestId("prd-selection-composer")).toBeNull();
    await openComposer();

    expect(screen.getAllByTestId("prd-selection-composer")).toHaveLength(1);
    expect(screen.getByText("“Reduce checkout friction while preserving trust.”"))
      .toBeVisible();
  });

  it("never offers a per-section Ask button", async () => {
    renderDocument();
    expect(screen.queryByRole("button", { name: /^ask/i })).toBeNull();
    await openComposer();
    expect(screen.queryByRole("button", { name: /^ask/i })).toBeNull();
  });

  it("submits through assistPrdSection and never the old revise path", async () => {
    const { user } = renderDocument();
    await openComposer();

    await ask(user, "Why did we choose this?");

    await waitFor(() => expect(mocks.assistPrdSection).toHaveBeenCalledTimes(1));
    expect(mocks.assistPrdSection).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: ROOM_ID,
        instruction: "Why did we choose this?",
        sections: [
          {
            field: "executiveSummary",
            sectionLabel: "Executive summary",
            quotedText: "Reduce checkout friction while preserving trust.",
          },
        ],
      }),
    );
    expect(mocks.revisePrdSection).not.toHaveBeenCalled();
  });

  it("carries a backwards multi-section scope in document order", async () => {
    const { user } = renderDocument();

    // Dragged upwards, from the third rendered section back into the first.
    selectBetween(
      bodyTextNode("executiveSummary", "Reduce checkout"),
      bodyTextNode("targetUsersAndUseCases", "Returning shoppers"),
      "backward",
    );
    fireEvent.mouseUp(sectionElement("targetUsersAndUseCases"));
    await screen.findByTestId("prd-selection-composer");

    expect(screen.getByText("3 sections selected")).toBeVisible();

    await ask(user, "Why are we going in this direction?");
    await waitFor(() => expect(mocks.assistPrdSection).toHaveBeenCalledTimes(1));
    expect(
      mocks.assistPrdSection.mock.calls[0][0].sections.map(
        (section: { field: string }) => section.field,
      ),
    ).toEqual([
      "executiveSummary",
      "problemAndEvidence",
      "targetUsersAndUseCases",
    ]);
  });

  it("shows the answer in place with a link to its Conversation message", async () => {
    mocks.getPrdAssistRequest.mockResolvedValue(
      assistRequest({
        status: "ready",
        taskStatus: "completed",
        answer: "We chose it because shoppers asked for it.",
        answerMessageId: "60000000-0000-4000-8000-000000000002",
      }),
    );
    const { user } = renderDocument();
    await openComposer();
    await ask(user, "Why did we choose this?");

    expect(
      await screen.findByText("We chose it because shoppers asked for it."),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Open in Conversation" }),
    ).toHaveAttribute(
      "href",
      `${BASE_PATH}?tab=conversation#message-60000000-0000-4000-8000-000000000002`,
    );
  });

  it("replies to a clarifying question with the same frozen scope", async () => {
    mocks.getPrdAssistRequest.mockResolvedValue(
      assistRequest({
        status: "ready",
        taskStatus: "completed",
        clarifyingQuestion: "Which section should I change first?",
      }),
    );
    const { user } = renderDocument();
    await openComposer();
    await ask(user, "Fix this.");

    expect(
      await screen.findByText("Which section should I change first?"),
    ).toBeVisible();

    await ask(user, "The summary.");
    await waitFor(() => expect(mocks.assistPrdSection).toHaveBeenCalledTimes(2));
    expect(mocks.assistPrdSection.mock.calls[1][0].sections).toEqual(
      mocks.assistPrdSection.mock.calls[0][0].sections,
    );
    // A fresh idempotency key, or the RPC would replay the first request.
    expect(mocks.assistPrdSection.mock.calls[1][0].clientRequestId).not.toBe(
      mocks.assistPrdSection.mock.calls[0][0].clientRequestId,
    );
  });

  it("closes the popover when the outcome is an edit, leaving the card inline", async () => {
    mocks.getPrdAssistRequest.mockResolvedValue(
      assistRequest({
        status: "ready",
        taskStatus: "completed",
        proposalId: PROPOSAL_ID,
      }),
    );
    mocks.listPrdProposals.mockResolvedValue([readyProposal()]);
    const { user } = renderDocument();
    await openComposer();
    await ask(user, "Rewrite this for small teams.");

    await waitFor(() =>
      expect(screen.queryByTestId("prd-selection-composer")).toBeNull(),
    );
    expect(await screen.findByTestId("prd-proposal-card")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Apply changes" }),
    ).toBeVisible();
  });

  it("keeps the answer in the popover and the proposal in the section", async () => {
    mocks.getPrdAssistRequest.mockResolvedValue(
      assistRequest({
        status: "ready",
        taskStatus: "completed",
        answer: "The rationale, explained.",
        proposalId: PROPOSAL_ID,
      }),
    );
    mocks.listPrdProposals.mockResolvedValue([readyProposal()]);
    const { user } = renderDocument();
    await openComposer();
    await ask(user, "Explain this and make the rationale clearer.");

    expect(await screen.findByText("The rationale, explained.")).toBeVisible();
    expect(screen.getByTestId("prd-selection-composer")).toBeVisible();
    expect(await screen.findByTestId("prd-proposal-card")).toBeVisible();
    expect(screen.getByRole("button", { name: "Apply changes" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Discard" })).toBeVisible();
  });

  it("recovers from a failure onto the other provider", async () => {
    mocks.getPrdAssistRequest.mockResolvedValue(
      assistRequest({
        status: "failed",
        taskStatus: "usage_limit_reached",
        errorCode: "usage_limit_reached",
      }),
    );
    const { user } = renderDocument();
    await openComposer();
    await ask(user, "Why did we choose this?");

    await user.click(
      await screen.findByRole("button", { name: "Try with Claude" }),
    );

    await waitFor(() => expect(mocks.assistPrdSection).toHaveBeenCalledTimes(2));
    expect(mocks.assistPrdSection.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        provider: "claude",
        instruction: "Why did we choose this?",
      }),
    );
  });

  it("explains a refused apply on the card instead of a passing toast", async () => {
    mocks.listPrdProposals.mockResolvedValue([readyProposal()]);
    mocks.applyPrdProposal.mockResolvedValue({
      status: "error",
      message: "Could not apply the PRD proposal. The document may have changed.",
    });
    const { user } = renderDocument();

    await user.click(await screen.findByRole("button", { name: "Apply changes" }));

    expect(
      await screen.findByText(
        "Could not apply the PRD proposal. The document may have changed.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Apply changes" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Discard" })).toBeEnabled();
  });

  it("closes on Escape without touching the document", async () => {
    renderDocument();
    await openComposer();

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() =>
      expect(screen.queryByTestId("prd-selection-composer")).toBeNull(),
    );
    expect(
      screen.getByText("Reduce checkout friction while preserving trust."),
    ).toBeVisible();
    expect(mocks.assistPrdSection).not.toHaveBeenCalled();
    expect(mocks.applyPrdProposal).not.toHaveBeenCalled();
  });

  it("lets a view-only participant ask but never apply anyone's proposal", async () => {
    mocks.listPrdProposals.mockResolvedValue([readyProposal()]);
    mocks.getPrdAssistRequest.mockResolvedValue(
      assistRequest({
        status: "ready",
        taskStatus: "completed",
        canProposeEdit: false,
        answer: "Costs appear late in the flow today.",
      }),
    );
    const { user } = renderDocument({ canEdit: false });
    await openComposer();
    await ask(user, "Why did we choose this?");

    expect(
      await screen.findByText("Costs appear late in the flow today."),
    ).toBeVisible();
    // Another participant's proposal is live in the room, and stays invisible
    // to a reader who could not act on it.
    expect(screen.queryByTestId("prd-proposal-card")).toBeNull();
    expect(screen.queryByRole("button", { name: "Apply changes" })).toBeNull();
  });

  it("recovers the reader's earlier requests without reopening a popover", async () => {
    mocks.listPrdAssistRequests.mockResolvedValue([
      assistRequest({
        id: "80000000-0000-4000-8000-00000000000f",
        status: "ready",
        taskStatus: "completed",
        answer: "An answer from before the refresh.",
        instruction: "What backs this up?",
      }),
    ]);
    const { user } = renderDocument();

    expect(await screen.findByText(/earlier Product Agent request/i)).toBeVisible();
    expect(screen.queryByTestId("prd-selection-composer")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    await waitFor(() =>
      expect(mocks.dismissPrdAssistRequest).toHaveBeenCalledWith({
        roomId: ROOM_ID,
        requestId: "80000000-0000-4000-8000-00000000000f",
      }),
    );
    expect(screen.queryByText(/earlier Product Agent request/i)).toBeNull();
  });
});
