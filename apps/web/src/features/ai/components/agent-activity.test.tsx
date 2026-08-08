// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentActivity } from "./agent-activity";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("AgentActivity", () => {
  it.each([
    { status: "queued" as const, label: "Queued" },
    {
      status: "waiting_for_device" as const,
      label: "Waiting for your device",
    },
    { status: "ready_to_run" as const, label: "Starting" },
    { status: "running" as const, label: "Responding" },
  ])("labels the $status room reply", ({ status, label }) => {
    render(<AgentActivity status={status} provider="codex" />);
    expect(screen.getByRole("status")).toHaveTextContent(label);
  });

  it("names PRD generation rather than a reply while running", () => {
    render(
      <AgentActivity
        status="running"
        provider="codex"
        kind="prd_generate"
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Drafting your PRD");
  });

  it.each([
    "completed" as const,
    "cancelled" as const,
    "failed" as const,
    "needs_review" as const,
    "needs_reauthentication" as const,
    "usage_limit_reached" as const,
  ])("renders nothing for the settled %s status", (status) => {
    // Settled and attention states carry recovery actions and belong to
    // AgentTaskState's Banner path, not to a thinking indicator.
    const { container } = render(
      <AgentActivity status={status} provider="codex" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("attributes the running provider", () => {
    render(<AgentActivity status="running" provider="claude" />);
    expect(screen.getByText(/Claude/)).toBeVisible();
  });

  it("omits attribution when no provider is known yet", () => {
    // PrdGenerating renders during isInitialLoading, before a task row
    // exists. Inventing a provider there would be a lie.
    render(<AgentActivity status="queued" />);
    expect(screen.queryByText(/Codex|Claude/)).not.toBeInTheDocument();
  });

  it("counts elapsed time from the task's start", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-08T10:00:12.000Z"));

    render(
      <AgentActivity
        status="running"
        provider="codex"
        startedAt="2026-08-08T10:00:00.000Z"
      />,
    );

    expect(screen.getByText("12s")).toBeVisible();
  });

  it("advances the counter while the task runs", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-08T10:00:00.000Z"));

    render(
      <AgentActivity
        status="running"
        provider="codex"
        startedAt="2026-08-08T10:00:00.000Z"
      />,
    );
    expect(screen.getByText("0s")).toBeVisible();

    // Without this, a component that computed elapsed time once and never
    // re-rendered would pass the test above and still show a frozen counter.
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText("3s")).toBeVisible();
  });

  it("omits the counter when no start time is known", () => {
    render(<AgentActivity status="queued" />);
    expect(screen.queryByText(/\ds/)).not.toBeInTheDocument();
  });

  it("renders slot content beneath the label", () => {
    // The reserved seam for a future reasoning transcript. Nothing passes
    // children today; this keeps the slot from silently rotting.
    render(
      <AgentActivity status="running" provider="codex">
        <p>Reasoning would go here</p>
      </AgentActivity>,
    );
    expect(screen.getByText("Reasoning would go here")).toBeVisible();
  });

  it("stops the elapsed interval once status leaves the active window", () => {
    // A parent may keep AgentActivity mounted at the same tree position
    // while status settles, with startedAt unchanged. If the interval were
    // gated on startedAt alone, it would keep ticking forever even though
    // the component now renders null.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-08T10:00:00.000Z"));

    const { rerender } = render(
      <AgentActivity
        status="running"
        provider="codex"
        startedAt="2026-08-08T10:00:00.000Z"
      />,
    );
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    rerender(
      <AgentActivity
        status="completed"
        provider="codex"
        startedAt="2026-08-08T10:00:00.000Z"
      />,
    );

    expect(vi.getTimerCount()).toBe(0);
  });

  it("reaches WaveText as the large text type at hero size", () => {
    // WaveText's outer role="status" element reflects its `type` prop as
    // a `data-type` attribute -- part of Astryx's documented theme-prop
    // surface, not an internal we're reaching past.
    render(<AgentActivity status="running" provider="codex" size="hero" />);
    expect(screen.getByRole("status")).toHaveAttribute("data-type", "large");
  });
});
