// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { HistoryDrawer } from "./history-drawer";
import type { RoomMessage } from "@/features/rooms/repository";
import type { DesignScreenEvent } from "@meld/contracts";

afterEach(() => {
  cleanup();
  // The shared `load` fixture's mocks (below) are reused by reference across
  // every test in this file, spread onto each render's props -- clear their
  // call history so a later test's call-count assertions aren't polluted by
  // earlier renders.
  vi.clearAllMocks();
});

const ROOM = "9b1f7e2e-3c2a-4c1a-8f9a-2f8e9c1d4a11";

const messages = [
  {
    id: "m1",
    body: "Build a pick-plan screen",
    authorType: "human",
    createdAt: "2026-08-14T10:00:00.000Z",
  },
] as unknown as RoomMessage[];

const events = [
  {
    id: "e1",
    roomId: ROOM,
    screenId: "s1",
    kind: "generation_started",
    messageId: null,
    taskId: null,
    versionId: null,
    actor: null,
    createdAt: "2026-08-14T10:01:00.000Z",
  },
  {
    id: "e2",
    roomId: ROOM,
    screenId: "s2",
    kind: "version_created",
    messageId: null,
    taskId: null,
    versionId: null,
    actor: null,
    createdAt: "2026-08-14T10:02:00.000Z",
  },
] as unknown as DesignScreenEvent[];

const load = {
  loadMessages: vi.fn(async () => messages),
  loadEvents: vi.fn(async () => events),
  // No-op subscriptions: keeps the drawer's live-update effect from ever
  // calling the real `subscribeToProductionRoom`/`subscribeToDesignEvents`
  // (which reach for a live Supabase client) in these offline tests.
  subscribeMessages: vi.fn(() => () => {}),
  subscribeEvents: vi.fn(() => () => {}),
};

describe("HistoryDrawer", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <HistoryDrawer
        roomId={ROOM}
        selectedScreenId={null}
        open={false}
        onClose={() => {}}
        {...load}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the unified feed when nothing is selected", async () => {
    render(
      <HistoryDrawer
        roomId={ROOM}
        selectedScreenId={null}
        open
        onClose={() => {}}
        {...load}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("Build a pick-plan screen")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("history-entry-e1")).toBeInTheDocument();
    expect(screen.getByTestId("history-entry-e2")).toBeInTheDocument();
  });

  it("filters to the selected screen's events", async () => {
    render(
      <HistoryDrawer
        roomId={ROOM}
        selectedScreenId="s1"
        open
        onClose={() => {}}
        {...load}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("history-entry-e1")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("history-entry-e2")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Build a pick-plan screen"),
    ).not.toBeInTheDocument();
  });

  it("merges a live subscribed event into the feed", async () => {
    let deliverEvent: ((event: DesignScreenEvent) => void) | undefined;
    const subscribeEvents = vi.fn(
      (_roomId: string, onEvent: (event: DesignScreenEvent) => void) => {
        deliverEvent = onEvent;
        return () => {};
      },
    );

    render(
      <HistoryDrawer
        roomId={ROOM}
        selectedScreenId={null}
        open
        onClose={() => {}}
        {...load}
        subscribeEvents={subscribeEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("history-entry-e1")).toBeInTheDocument(),
    );
    expect(subscribeEvents).toHaveBeenCalledWith(ROOM, expect.any(Function));

    const liveEvent = {
      id: "e3",
      roomId: ROOM,
      screenId: "s1",
      kind: "version_promoted",
      messageId: null,
      taskId: null,
      versionId: null,
      actor: null,
      createdAt: "2026-08-14T10:03:00.000Z",
    } as unknown as DesignScreenEvent;

    act(() => {
      deliverEvent?.(liveEvent);
    });

    await waitFor(() =>
      expect(screen.getByTestId("history-entry-e3")).toBeInTheDocument(),
    );
    // The events loaded up front are untouched -- this is an upsert, not a
    // replace.
    expect(screen.getByTestId("history-entry-e1")).toBeInTheDocument();
    expect(screen.getByTestId("history-entry-e2")).toBeInTheDocument();
  });

  it("does not tear down and recreate the subscriptions when only the selection changes", async () => {
    const { rerender } = render(
      <HistoryDrawer
        roomId={ROOM}
        selectedScreenId={null}
        open
        onClose={() => {}}
        {...load}
      />,
    );
    await waitFor(() =>
      expect(load.subscribeEvents).toHaveBeenCalledTimes(1),
    );
    expect(load.subscribeMessages).toHaveBeenCalledTimes(1);

    rerender(
      <HistoryDrawer
        roomId={ROOM}
        selectedScreenId="s1"
        open
        onClose={() => {}}
        {...load}
      />,
    );

    // A parent re-render that only flips `selectedScreenId` must not tear
    // down and reopen either subscription -- the load/subscribe effects don't
    // depend on it.
    expect(load.subscribeEvents).toHaveBeenCalledTimes(1);
    expect(load.subscribeMessages).toHaveBeenCalledTimes(1);
  });
});
