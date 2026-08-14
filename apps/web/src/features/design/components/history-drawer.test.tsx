// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { HistoryDrawer } from "./history-drawer";
import type { RoomMessage } from "@/features/rooms/repository";
import type { DesignScreenEvent } from "@meld/contracts";

afterEach(cleanup);

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
});
