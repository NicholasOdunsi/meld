// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PrdGenerating } from "./prd-generating";

const mockUseRoomTaskStatus = vi.hoisted(() => vi.fn());

vi.mock("./room-task-status-provider", () => ({
  useRoomTaskStatus: mockUseRoomTaskStatus,
}));

afterEach(cleanup);

const RUNNING_TASK = {
  taskId: "task-1",
  sourceMessageId: null,
  initiatingUserId: "user-1",
  provider: "codex" as const,
  kind: "prd_generate" as const,
  status: "running" as const,
  createdAt: "2026-08-08T10:00:00.000Z",
  updatedAt: "2026-08-08T10:00:00.000Z",
};

beforeEach(() => {
  mockUseRoomTaskStatus.mockReturnValue({
    notifyQueued: vi.fn(),
    latestPrdTask: RUNNING_TASK,
    hasPrdGeneration: true,
  });
});

it("shows the live generation state", () => {
  render(<PrdGenerating />);
  expect(screen.getByRole("status")).toHaveTextContent("Drafting your PRD");
});

it("claims no step it cannot observe", () => {
  // The previous implementation hardcoded which steps were "done", so it
  // reported the same two steps from the first frame to the last. The
  // browser-visible task projection carries status only -- there is no
  // per-step signal to drive these, so they must not reappear.
  render(<PrdGenerating />);

  for (const fabricated of [
    "Gathered room context",
    "Writing sections",
    "Linking decisions",
    "Finalizing",
  ]) {
    expect(screen.queryByText(fabricated)).not.toBeInTheDocument();
  }
});

it("shows an honest loading label, not a wave, once the task has completed but the document hasn't materialized", () => {
  // The task is done -- the browser genuinely knows that -- but the
  // document itself hasn't landed yet (router.refresh() is still in
  // flight). AgentActivity would render nothing at all for a completed
  // status, since nothing is actively running; PrdGenerating must not
  // leave that window blank.
  mockUseRoomTaskStatus.mockReturnValue({
    notifyQueued: vi.fn(),
    latestPrdTask: { ...RUNNING_TASK, status: "completed" as const },
    hasPrdGeneration: true,
  });

  render(<PrdGenerating />);

  expect(screen.getByText("Loading your PRD")).toBeVisible();
  expect(screen.queryByText("Drafting your PRD")).not.toBeInTheDocument();
});

it("shows an honest loading label before the first poll lands, rather than claiming the task is queued", () => {
  // No task row exists yet and there is no optimistic notice either -- the
  // browser has no basis to claim anything as specific as "Queued". (This
  // is the only way PrdGenerating mounts with no latestPrdTask and
  // hasPrdGeneration false: PrdTabContent renders it when
  // hasPrdGeneration || isInitialLoading.)
  mockUseRoomTaskStatus.mockReturnValue({
    notifyQueued: vi.fn(),
    latestPrdTask: null,
    hasPrdGeneration: false,
  });

  render(<PrdGenerating />);

  expect(screen.getByText("Loading your PRD")).toBeVisible();
  expect(screen.queryByText("Queued")).not.toBeInTheDocument();
});

it("still shows Queued for an optimistic notice that hasn't been confirmed by a poll yet", () => {
  // Here the browser does genuinely know: the user just requested
  // generation and got a task id back, which is what makes
  // hasPrdGeneration true before any poll has landed. There is no task row
  // in the polled statuses yet, but this is not the same as not knowing
  // anything.
  mockUseRoomTaskStatus.mockReturnValue({
    notifyQueued: vi.fn(),
    latestPrdTask: null,
    hasPrdGeneration: true,
  });

  render(<PrdGenerating />);

  expect(screen.getByText("Queued")).toBeVisible();
});
