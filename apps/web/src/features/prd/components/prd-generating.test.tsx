// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PrdGenerating } from "./prd-generating";

vi.mock("./room-task-status-provider", () => ({
  useRoomTaskStatus: () => ({
    notifyQueued: vi.fn(),
    latestPrdTask: {
      taskId: "task-1",
      sourceMessageId: null,
      initiatingUserId: "user-1",
      provider: "codex" as const,
      kind: "prd_generate" as const,
      status: "running" as const,
      createdAt: "2026-08-08T10:00:00.000Z",
      updatedAt: "2026-08-08T10:00:00.000Z",
    },
  }),
}));

afterEach(cleanup);

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
