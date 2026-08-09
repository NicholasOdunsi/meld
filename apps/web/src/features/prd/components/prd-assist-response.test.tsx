// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrdAssistRequest } from "../schemas";
import { PrdAssistResponse } from "./prd-assist-response";

const BASE_PATH = "/org/discovery/room";
const ANSWER_MESSAGE_ID = "60000000-0000-4000-8000-000000000002";

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
    selectedSections: [
      {
        field: "executiveSummary",
        label: "Executive summary",
        quotedText: "Reduce checkout friction.",
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
    createdBy: "10000000-0000-4000-8000-000000000001",
    createdAt: "2026-08-08T10:00:00.000Z",
    updatedAt: "2026-08-08T10:00:00.000Z",
    settledAt: null,
    ...overrides,
  };
}

afterEach(cleanup);

describe("PrdAssistResponse", () => {
  it("says the Product Agent is thinking while the request is pending", () => {
    render(
      <PrdAssistResponse
        request={assistRequest()}
        basePath={BASE_PATH}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Product Agent is thinking",
    );
  });

  it("renders an answer with a link to its Conversation message", () => {
    render(
      <PrdAssistResponse
        request={assistRequest({
          status: "ready",
          taskStatus: "completed",
          answer: "We chose it because dispatchers asked for it.",
          answerMessageId: ANSWER_MESSAGE_ID,
          settledAt: "2026-08-08T10:00:05.000Z",
        })}
        basePath={BASE_PATH}
        onRetry={vi.fn()}
      />,
    );

    expect(
      screen.getByText("We chose it because dispatchers asked for it."),
    ).toBeVisible();
    // The wave label that said "thinking" is a live region, and it unmounts
    // when the result lands. Without one here a screen reader is told the
    // agent started and never told it finished.
    expect(screen.getByRole("status")).toHaveTextContent(
      "We chose it because dispatchers asked for it.",
    );
    expect(
      screen.getByRole("link", { name: "Open in Conversation" }),
    ).toHaveAttribute(
      "href",
      `${BASE_PATH}?tab=conversation#message-${ANSWER_MESSAGE_ID}`,
    );
  });

  it("still offers the Conversation tab when the message id has not arrived", () => {
    render(
      <PrdAssistResponse
        request={assistRequest({
          status: "ready",
          taskStatus: "completed",
          answer: "An answer with no materialized message yet.",
        })}
        basePath={BASE_PATH}
        onRetry={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Open in Conversation" }),
    ).toHaveAttribute("href", `${BASE_PATH}?tab=conversation`);
  });

  it("renders the answer half of a mixed outcome, leaving the edit inline", () => {
    render(
      <PrdAssistResponse
        request={assistRequest({
          status: "ready",
          taskStatus: "completed",
          answer: "Here is the rationale.",
          proposalId: "a0000000-0000-4000-8000-000000000001",
          answerMessageId: ANSWER_MESSAGE_ID,
        })}
        basePath={BASE_PATH}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText("Here is the rationale.")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Open in Conversation" }),
    ).toBeVisible();
    // The proposal belongs beside the text it changes, not in the popover.
    expect(screen.queryByTestId("prd-proposal-card")).toBeNull();
  });

  it("renders a clarifying question without a Conversation link", () => {
    render(
      <PrdAssistResponse
        request={assistRequest({
          status: "ready",
          taskStatus: "completed",
          clarifyingQuestion: "Which section should I change first?",
        })}
        basePath={BASE_PATH}
        onRetry={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Which section should I change first?"),
    ).toBeVisible();
    // Announced for the same reason the answer is: the pending live region
    // that said "thinking" has gone, and this replaced it.
    expect(screen.getByRole("status")).toHaveTextContent(
      "Which section should I change first?",
    );
    expect(
      screen.queryByRole("link", { name: "Open in Conversation" }),
    ).toBeNull();
  });

  it("renders nothing for an edit-only outcome", () => {
    const { container } = render(
      <PrdAssistResponse
        request={assistRequest({
          status: "ready",
          taskStatus: "completed",
          proposalId: "a0000000-0000-4000-8000-000000000001",
        })}
        basePath={BASE_PATH}
        onRetry={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("explains a failure and offers both a retry and the other provider", () => {
    const onRetry = vi.fn();
    render(
      <PrdAssistResponse
        request={assistRequest({
          status: "failed",
          taskStatus: "usage_limit_reached",
          errorCode: "usage_limit_reached",
          provider: "codex",
          settledAt: "2026-08-08T10:00:05.000Z",
        })}
        basePath={BASE_PATH}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText(/usage limit/i)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledWith("codex");

    fireEvent.click(screen.getByRole("button", { name: "Try with Claude" }));
    expect(onRetry).toHaveBeenLastCalledWith("claude");
  });

  it("names the conflicting proposal when the edit half was refused", () => {
    // No answer half survived, so the whole outcome reads as a failure and the
    // reason arrives on the error banner.
    render(
      <PrdAssistResponse
        request={assistRequest({
          status: "ready",
          taskStatus: "completed",
          proposalErrorCode: "section_has_active_proposal",
          settledAt: "2026-08-08T10:00:05.000Z",
        })}
        basePath={BASE_PATH}
        onRetry={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/already has a suggestion waiting for review/i),
    ).toBeVisible();
  });

  it("says the edit half was refused even when the answer half landed", () => {
    // Settlement keeps the answer and records why the edit could not be
    // written, so the outcome reads as a plain answer. Showing only the answer
    // leaves the reader waiting for a change that is never coming.
    render(
      <PrdAssistResponse
        request={assistRequest({
          status: "ready",
          taskStatus: "completed",
          answer: "Here is the rationale.",
          proposalErrorCode: "section_has_active_proposal",
          answerMessageId: ANSWER_MESSAGE_ID,
          settledAt: "2026-08-08T10:00:05.000Z",
        })}
        basePath={BASE_PATH}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText("Here is the rationale.")).toBeVisible();
    expect(
      screen.getByText(/already has a suggestion waiting for review/i),
    ).toBeVisible();
  });

  it("says a view-only refusal alongside an answer too", () => {
    render(
      <PrdAssistResponse
        request={assistRequest({
          status: "ready",
          taskStatus: "completed",
          canProposeEdit: false,
          answer: "It covers the empty state.",
          proposalErrorCode: "edit_not_permitted",
          settledAt: "2026-08-08T10:00:05.000Z",
        })}
        basePath={BASE_PATH}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText(/view-only access/i)).toBeVisible();
  });

  it("leaves an unrefused answer with no note about the edit half", () => {
    render(
      <PrdAssistResponse
        request={assistRequest({
          status: "ready",
          taskStatus: "completed",
          answer: "Here is the rationale.",
          proposalId: "a0000000-0000-4000-8000-000000000001",
          settledAt: "2026-08-08T10:00:05.000Z",
        })}
        basePath={BASE_PATH}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("prd-assist-edit-refusal")).toBeNull();
  });

  it("reads a retried request as still thinking rather than failed", () => {
    // resolve_ai_task('retry') puts the task back in flight while the request
    // row still says failed; showing the previous run's reason there would be
    // a stale claim about a request that has not failed yet.
    render(
      <PrdAssistResponse
        request={assistRequest({
          status: "failed",
          taskStatus: "running",
          errorCode: "usage_limit_reached",
        })}
        basePath={BASE_PATH}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Product Agent is thinking",
    );
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });
});
