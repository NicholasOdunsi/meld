// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentTaskState } from "./agent-task-state";

afterEach(cleanup);

describe("AgentTaskState", () => {
  it("shows a queued pending state with a cancel action", async () => {
    const onCancel = vi.fn();
    render(
      <AgentTaskState status="queued" provider="codex" onCancel={onCancel} />,
    );

    expect(screen.getByText("Queued")).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Cancel" }),
    );
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("offers reconnect while waiting for the device", async () => {
    const onReconnect = vi.fn();
    render(
      <AgentTaskState
        status="waiting_for_device"
        provider="codex"
        onReconnect={onReconnect}
      />,
    );

    expect(screen.getByText("Waiting for your device")).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Reconnect" }),
    );
    expect(onReconnect).toHaveBeenCalledOnce();
  });

  it("names the running provider for Codex", () => {
    render(<AgentTaskState status="running" provider="codex" />);
    expect(screen.getByText(/Codex/)).toBeVisible();
  });

  it("names the running provider for Claude", () => {
    render(<AgentTaskState status="running" provider="claude" />);
    expect(screen.getByText(/Claude/)).toBeVisible();
  });

  it("renders no pending UI once the task completes so the persisted reply is authoritative", () => {
    const { container } = render(
      <AgentTaskState status="completed" provider="claude" />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows elapsed time on the pending state", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-08T10:00:07.000Z"));

    render(
      <AgentTaskState
        status="running"
        provider="codex"
        startedAt="2026-08-08T10:00:00.000Z"
      />,
    );

    expect(screen.getByText("7s")).toBeVisible();
    vi.useRealTimers();
  });

  it("renders no pending UI once the task is cancelled", () => {
    const { container } = render(
      <AgentTaskState status="cancelled" provider="codex" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("routes a needs-authentication blocker to fixing the connection, not a retry", async () => {
    const onFixConnection = vi.fn();
    const onAskAgain = vi.fn();
    render(
      <AgentTaskState
        status="needs_reauthentication"
        provider="codex"
        onFixConnection={onFixConnection}
        onAskAgain={onAskAgain}
      />,
    );

    expect(screen.getByText("Authentication required")).toBeVisible();
    // No misleading "Retry"/"Switch provider"/"Ask again" affordances here.
    expect(
      screen.queryByRole("button", { name: "Retry" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Switch provider" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Ask again" }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Fix connection" }),
    );
    expect(onFixConnection).toHaveBeenCalledOnce();
    expect(onAskAgain).not.toHaveBeenCalled();
  });

  it("frames a usage-limit blocker as the user's own provider and offers to switch", async () => {
    const onFixConnection = vi.fn();
    render(
      <AgentTaskState
        status="usage_limit_reached"
        provider="claude"
        onFixConnection={onFixConnection}
      />,
    );

    // Names it as the user's own provider limit (not an app-wide outage) and
    // says it is Claude specifically.
    expect(screen.getByText("Your Claude usage limit was reached")).toBeVisible();
    expect(screen.getByText(/your own provider/i)).toBeVisible();
    // "Reconnect"/"Fix connection" is the wrong remedy for a quota; switching is.
    expect(
      screen.queryByRole("button", { name: "Fix connection" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Switch provider" }),
    );
    expect(onFixConnection).toHaveBeenCalledOnce();
  });

  it("offers ask again (not device settings) when the reply needs review", async () => {
    const onAskAgain = vi.fn();
    const onFixConnection = vi.fn();
    render(
      <AgentTaskState
        status="needs_review"
        provider="codex"
        onAskAgain={onAskAgain}
        onFixConnection={onFixConnection}
      />,
    );

    expect(screen.getByText("The reply needs review")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Fix connection" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Retry" }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Ask again" }));
    expect(onAskAgain).toHaveBeenCalledOnce();
    expect(onFixConnection).not.toHaveBeenCalled();
  });

  it("offers ask again (not device settings) when the task fails", async () => {
    const onAskAgain = vi.fn();
    const onFixConnection = vi.fn();
    render(
      <AgentTaskState
        status="failed"
        provider="codex"
        onAskAgain={onAskAgain}
        onFixConnection={onFixConnection}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Fix connection" }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Ask again" }));
    expect(onAskAgain).toHaveBeenCalledOnce();
    expect(onFixConnection).not.toHaveBeenCalled();
  });

  it.each([
    {
      status: "needs_reauthentication" as const,
      title: "Authentication required",
      actionLabel: "Fix connection",
      action: "fix" as const,
    },
    {
      status: "usage_limit_reached" as const,
      title: "Your Codex usage limit was reached",
      actionLabel: "Switch provider",
      action: "fix" as const,
    },
    {
      status: "needs_review" as const,
      title: "The PRD needs review",
      actionLabel: "Try again",
      action: "retry" as const,
    },
    {
      status: "failed" as const,
      title: "The PRD could not be generated",
      actionLabel: "Try again",
      action: "retry" as const,
    },
  ])(
    "maps PRD $status to its recovery message and action",
    async ({ status, title, actionLabel, action }) => {
      const onFixConnection = vi.fn();
      const onRetry = vi.fn();
      render(
        <AgentTaskState
          taskKind="prd_generate"
          status={status}
          provider="codex"
          onFixConnection={onFixConnection}
          onRetry={onRetry}
        />,
      );

      expect(screen.getByText(title)).toBeVisible();
      await userEvent.click(
        screen.getByRole("button", { name: actionLabel }),
      );
      expect(onFixConnection).toHaveBeenCalledTimes(action === "fix" ? 1 : 0);
      expect(onRetry).toHaveBeenCalledTimes(action === "retry" ? 1 : 0);
    },
  );
});
