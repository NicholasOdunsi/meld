// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentsTranscript } from "./agents-transcript";
import type { DesignAgentTurn } from "../design-agent-transcript";

const currentUserId = "10000000-0000-4000-8000-000000000001";
const taskId = "70000000-0000-4000-8000-000000000007";

function turn(overrides: Partial<DesignAgentTurn> = {}): DesignAgentTurn {
  return {
    taskId,
    screenId: "50000000-0000-4000-8000-000000000005",
    screenName: "Sign in",
    userPrompt: "A clean sign in screen",
    initiatedBy: currentUserId,
    taskStatus: "completed",
    screenState: "built",
    currentVersionId: "80000000-0000-4000-8000-000000000008",
    createdAt: "2026-08-17T00:00:00.000Z",
    ...overrides,
  };
}

afterEach(cleanup);

describe("AgentsTranscript", () => {
  it("shows the user's prompt attributed to them and the design agent's reply", () => {
    render(
      <AgentsTranscript
        turns={[turn()]}
        currentUserId={currentUserId}
        currentUserName="Ada"
      />,
    );
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("A clean sign in screen")).toBeInTheDocument();
    expect(screen.getByText("Design Agent")).toBeInTheDocument();
    expect(screen.getByText(/Built Sign in/)).toBeInTheDocument();
  });

  it("shows a thinking state while the generation is running", () => {
    render(
      <AgentsTranscript
        turns={[turn({ taskStatus: "running", screenState: "empty", currentVersionId: null })]}
        currentUserId={currentUserId}
        currentUserName="Ada"
      />,
    );
    expect(screen.getByText(/Designing your screen/)).toBeInTheDocument();
    expect(screen.queryByText(/Built/)).not.toBeInTheDocument();
  });

  it("shows a failure line when the generation failed", () => {
    render(
      <AgentsTranscript
        turns={[turn({ taskStatus: "failed", screenState: "empty", currentVersionId: null })]}
        currentUserId={currentUserId}
        currentUserName="Ada"
      />,
    );
    expect(screen.getByText(/didn’t come through/)).toBeInTheDocument();
  });

  it("opens the built screen's preview from the View action", () => {
    const onPreview = vi.fn();
    render(
      <AgentsTranscript
        turns={[turn()]}
        currentUserId={currentUserId}
        currentUserName="Ada"
        onPreview={onPreview}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "View Sign in" }));
    expect(onPreview).toHaveBeenCalledWith("50000000-0000-4000-8000-000000000005");
  });

  it("attributes another member's prompt to a teammate, not the current user", () => {
    render(
      <AgentsTranscript
        turns={[turn({ initiatedBy: "20000000-0000-4000-8000-000000000002" })]}
        currentUserId={currentUserId}
        currentUserName="Ada"
      />,
    );
    expect(screen.getByText("Teammate")).toBeInTheDocument();
    expect(screen.queryByText("Ada")).not.toBeInTheDocument();
  });
});
