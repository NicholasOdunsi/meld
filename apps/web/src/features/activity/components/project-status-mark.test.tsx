// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { RoomActivity } from "@meld/contracts";
import { ProjectStatusMark } from "./project-status-mark";

afterEach(cleanup);

const asked: RoomActivity = {
  roomId: "r",
  projectId: "p",
  roomName: "Onboarding",
  state: "needs_you",
  reason: "asked",
  taskKind: "room_reply",
  taskStatus: "completed",
  provider: "claude",
  proposalKind: "prd_generate",
  proposalMessageId: "m",
  occurredAt: null,
  lastActivityAt: null,
};

describe("ProjectStatusMark", () => {
  it("shows the fallback glyph when idle", () => {
    render(
      <ProjectStatusMark
        name="Mail"
        color="var(--color-icon-teal)"
        state="idle"
        room={null}
        hop
        fallback={<i data-testid="glyph" />}
      />,
    );
    expect(screen.getByTestId("glyph")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("shows a swaying hat when working", () => {
    render(
      <ProjectStatusMark
        name="Orion"
        color="var(--color-icon-blue)"
        state="working"
        room={null}
        hop
        fallback={null}
      />,
    );
    expect(screen.getByRole("img", { name: "Orion: working" })).toHaveAttribute(
      "data-hat-state",
      "working",
    );
  });

  it("shows a hopping curious hat labelled with the reason", () => {
    render(
      <ProjectStatusMark
        name="Mark"
        color="var(--color-icon-orange)"
        state="needs_you"
        room={asked}
        hop
        fallback={null}
      />,
    );
    const hat = screen.getByRole("img", {
      name: "Mark needs you · Write the PRD?",
    });
    expect(hat).toHaveAttribute("data-hop", "true");
  });
});
