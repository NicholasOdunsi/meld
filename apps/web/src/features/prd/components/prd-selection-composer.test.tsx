// @vitest-environment jsdom

import type { PrdAssistScopeSection } from "@meld/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrdAssistRequest } from "../schemas";
import { PrdSelectionComposer } from "./prd-selection-composer";

const BASE_PATH = "/org/discovery/room";
const COMPOSER_PROMPT = "Ask about this or request a change...";

const oneSection: PrdAssistScopeSection[] = [
  {
    field: "executiveSummary",
    label: "Executive summary",
    quotedText: "Reduce checkout friction.",
  },
];

const threeSections: PrdAssistScopeSection[] = [
  ...oneSection,
  {
    field: "goalsNonGoalsAndMetrics",
    label: "Goals & metrics",
    quotedText: "Increase completed checkouts.",
  },
  {
    field: "risksAndMitigations",
    label: "Risks & mitigations",
    quotedText: "A denser summary could overwhelm small screens.",
  },
];

function assistRequest(
  overrides: Partial<PrdAssistRequest> = {},
): PrdAssistRequest {
  return {
    id: "80000000-0000-4000-8000-000000000001",
    roomId: "40000000-0000-4000-8000-000000000001",
    taskId: "70000000-0000-4000-8000-000000000001",
    clientRequestId: "90000000-0000-4000-8000-000000000001",
    basePrdId: "50000000-0000-4000-8000-000000000001",
    baseVersion: 3,
    selectedSections: oneSection,
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
    createdBy: "10000000-0000-4000-8000-000000000001",
    createdAt: "2026-08-08T10:00:00.000Z",
    updatedAt: "2026-08-08T10:00:00.000Z",
    settledAt: null,
    ...overrides,
  };
}

function renderComposer(
  props: Partial<Parameters<typeof PrdSelectionComposer>[0]> = {},
) {
  const user = userEvent.setup();
  const handlers = {
    onSubmit: vi.fn(),
    onRetry: vi.fn(),
    onClose: vi.fn(),
  };
  const view = render(
    <PrdSelectionComposer
      sections={oneSection}
      anchor={{ top: 120, left: 80 }}
      request={null}
      isSubmitting={false}
      basePath={BASE_PATH}
      {...handlers}
      {...props}
    />,
  );
  return { ...handlers, user, view };
}

// ChatComposerInput is a contenteditable combobox, not a textarea.
const input = () => screen.getByRole("combobox", { name: COMPOSER_PROMPT });
const sendButton = () => screen.getByRole("button", { name: "Send" });
const workingLabel = () =>
  screen.getByText("Product Agent is thinking", { selector: "span" });

afterEach(cleanup);

describe("PrdSelectionComposer", () => {
  it("opens with one neutral input and no mode control", () => {
    renderComposer();

    expect(screen.getByTestId("prd-selection-composer")).toBeVisible();
    // The same neutral words are both the visible placeholder and the
    // accessible label, so a screen-reader user is asked exactly what a
    // sighted one is.
    expect(input()).toHaveAccessibleName(COMPOSER_PROMPT);
    expect(screen.getByText(COMPOSER_PROMPT)).toBeVisible();
    expect(screen.getByText("“Reduce checkout friction.”")).toBeVisible();

    // Nothing asks the user to declare an intent, here or per section.
    for (const name of [/^ask$/i, /^edit$/i, /ask or edit/i, /request a change$/i]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
      expect(screen.queryByRole("radio", { name })).toBeNull();
      expect(screen.queryByRole("tab", { name })).toBeNull();
    }
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("summarizes a multi-section scope and keeps the excerpts folded away", () => {
    renderComposer({ sections: threeSections });

    expect(screen.getByText("3 sections selected")).toBeVisible();
    expect(
      screen.getByText("Executive summary · Goals & metrics · Risks & mitigations"),
    ).toBeVisible();

    const excerpts = screen.getByRole("button", { name: "Selected excerpts" });
    expect(excerpts).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(excerpts);
    expect(excerpts).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByText("“A denser summary could overwhelm small screens.”"),
    ).toBeVisible();
  });

  it("submits the typed instruction once and clears the input", async () => {
    const { onSubmit, user } = renderComposer();

    await user.type(input(), "Why did we choose this?");
    await user.click(sendButton());

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("Why did we choose this?");
    expect(input()).toHaveTextContent("");
  });

  it("refuses to submit an empty instruction", async () => {
    const { onSubmit, user } = renderComposer();

    expect(sendButton()).toBeDisabled();
    await user.type(input(), "   ");
    expect(sendButton()).toBeDisabled();

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("disables the input while the Product Agent is thinking", () => {
    renderComposer({ request: assistRequest() });

    expect(workingLabel()).toBeVisible();
    expect(input()).toHaveAttribute("contenteditable", "false");
  });

  it("shows the same working label between queueing and the first poll", () => {
    renderComposer({ isSubmitting: true });

    expect(workingLabel()).toBeVisible();
    expect(input()).toHaveAttribute("contenteditable", "false");
  });

  it("hands the input back for a clarifying reply, still scoped the same way", async () => {
    const { onSubmit, user } = renderComposer({
      sections: threeSections,
      request: assistRequest({
        status: "ready",
        taskStatus: "completed",
        selectedSections: threeSections,
        clarifyingQuestion: "Which section should I change first?",
      }),
    });

    expect(
      screen.getByText("Which section should I change first?"),
    ).toBeVisible();
    // The scope is retained, so the reply carries the same frozen fragments.
    expect(screen.getByText("3 sections selected")).toBeVisible();

    expect(input()).toHaveAttribute("contenteditable", "true");
    await user.type(input(), "The risks section.");
    await user.click(sendButton());

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("The risks section.");
  });

  it("ends the exchange at an answer, leaving no input to type into", () => {
    renderComposer({
      request: assistRequest({
        status: "ready",
        taskStatus: "completed",
        answer: "We chose it because dispatchers asked for it.",
        answerMessageId: "60000000-0000-4000-8000-000000000002",
      }),
    });

    expect(
      screen.getByRole("link", { name: "Open in Conversation" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("combobox", { name: COMPOSER_PROMPT }),
    ).toBeNull();
  });

  it("offers recovery on a failure and forwards the chosen provider", () => {
    const { onRetry } = renderComposer({
      request: assistRequest({
        status: "failed",
        taskStatus: "failed",
        errorCode: "usage_limit_reached",
      }),
    });

    fireEvent.click(screen.getByRole("button", { name: "Try with Claude" }));
    expect(onRetry).toHaveBeenCalledExactlyOnceWith("claude");
  });

  it("closes on Escape without submitting anything", async () => {
    const { onClose, onSubmit, user } = renderComposer();

    await user.type(input(), "Rewrite this.");
    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("closes on Escape from an answer state too", () => {
    const { onClose } = renderComposer({
      request: assistRequest({
        status: "ready",
        taskStatus: "completed",
        answer: "We chose it because dispatchers asked for it.",
      }),
    });

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
