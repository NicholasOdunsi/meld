// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
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

  it("marks streamed progress text as non-authoritative", () => {
    render(
      <AgentTaskState
        status="running"
        provider="claude"
        streamedText="Partial thoughts so far"
      />,
    );

    const progress = screen.getByTestId("agent-streamed-progress");
    expect(progress).toHaveAttribute("data-authoritative", "false");
    expect(
      within(progress).getByText("Partial thoughts so far"),
    ).toBeVisible();
    expect(
      within(progress).getByText("Draft — not the final reply"),
    ).toBeVisible();
  });

  it("renders no pending UI once the task completes so the persisted reply is authoritative", () => {
    const { container } = render(
      <AgentTaskState
        status="completed"
        provider="claude"
        streamedText="Partial thoughts so far"
      />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(
      screen.queryByText("Partial thoughts so far"),
    ).not.toBeInTheDocument();
  });

  it("renders no pending UI once the task is cancelled", () => {
    const { container } = render(
      <AgentTaskState status="cancelled" provider="codex" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("offers authenticate, switch provider, and retry when authentication is required", async () => {
    const onAuthenticate = vi.fn();
    const onSwitchProvider = vi.fn();
    const onRetry = vi.fn();
    render(
      <AgentTaskState
        status="needs_reauthentication"
        provider="codex"
        onAuthenticate={onAuthenticate}
        onSwitchProvider={onSwitchProvider}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText("Authentication required")).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Authenticate" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Switch provider" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onAuthenticate).toHaveBeenCalledOnce();
    expect(onSwitchProvider).toHaveBeenCalledOnce();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("offers switch provider and retry when the usage limit is reached", async () => {
    const onSwitchProvider = vi.fn();
    const onRetry = vi.fn();
    render(
      <AgentTaskState
        status="usage_limit_reached"
        provider="claude"
        onSwitchProvider={onSwitchProvider}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText("Usage limit reached")).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Switch provider" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onSwitchProvider).toHaveBeenCalledOnce();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("offers retry when the reply needs review", async () => {
    const onRetry = vi.fn();
    render(
      <AgentTaskState
        status="needs_review"
        provider="codex"
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText("The reply needs review")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("offers retry and switch provider when the task fails", async () => {
    const onRetry = vi.fn();
    const onSwitchProvider = vi.fn();
    render(
      <AgentTaskState
        status="failed"
        provider="codex"
        onRetry={onRetry}
        onSwitchProvider={onSwitchProvider}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Switch provider" }),
    );
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onSwitchProvider).toHaveBeenCalledOnce();
  });
});
