// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/design/use-screen-thumbnail", () => ({
  useScreenThumbnail: () => ({ status: "unavailable", dataUrl: null }),
}));

import { DesignTurnBubbles } from "./agents-transcript";
import { vi as vitest } from "vitest";
import type { DesignAgentTurn } from "../design-agent-transcript";

afterEach(cleanup);

const built = (id: string, name: string) => ({
  id,
  name,
  state: "built" as const,
  currentVersionId: `${id}-v1`,
});

function turnWith(screens: DesignAgentTurn["screens"]): DesignAgentTurn {
  return {
    taskId: "70000000-0000-4000-8000-000000000007",
    screenId: screens[0].id,
    screenName: screens[0].name,
    screens,
    userPrompt: "use green instead of red",
    initiatedBy: "10000000-0000-4000-8000-000000000001",
    taskStatus: "completed",
    screenState: "built",
    currentVersionId: screens[0].currentVersionId,
    createdAt: "2026-08-23T00:00:00.000Z",
  };
}

describe("a batch turn shows every screen it built", () => {
  it("says once what was created, rather than repeating a sentence per screen", () => {
    render(
      <DesignTurnBubbles
        turn={turnWith([
          built("50000000-0000-4000-8000-0000000000a1", "My Inspections"),
          built("50000000-0000-4000-8000-0000000000a2", "Profile"),
          built("50000000-0000-4000-8000-0000000000a3", "Saved Listings"),
        ])}
        currentUserId="10000000-0000-4000-8000-000000000001"
        currentUserName="Owner"
        onPreview={() => {}}
      />,
    );

    const summary = screen.getByTestId("agents-turn-summary");
    expect(summary).toHaveTextContent(/3 screens/i);
    // One sentence, not one per screen.
    expect(screen.queryAllByTestId("agents-turn-summary")).toHaveLength(1);
    expect(screen.queryByText(/take a look/i)).not.toBeInTheDocument();
  });

  it("counts a single screen in the singular", () => {
    render(
      <DesignTurnBubbles
        turn={turnWith([built("50000000-0000-4000-8000-0000000000a1", "My Inspections")])}
        currentUserId="10000000-0000-4000-8000-000000000001"
        currentUserName="Owner"
        onPreview={() => {}}
      />,
    );
    expect(screen.getByTestId("agents-turn-summary")).toHaveTextContent(
      /My Inspections/,
    );
  });

  it("lays the screens out as one scrollable row, not a wrapping wall", () => {
    render(
      <DesignTurnBubbles
        turn={turnWith([
          built("50000000-0000-4000-8000-0000000000a1", "My Inspections"),
          built("50000000-0000-4000-8000-0000000000a2", "Profile"),
        ])}
        currentUserId="10000000-0000-4000-8000-000000000001"
        currentUserName="Owner"
        onPreview={() => {}}
      />,
    );
    // A run can return a dozen screens; a wrapping grid would push the rest of
    // the conversation off screen, so this stays one row that scrolls.
    const rail = screen.getByTestId("agents-turn-screens");
    expect(rail.style.display).toBe("flex");
    expect(rail.style.overflowX).toBe("auto");
    // Scrollable, but without the bar: the thumbnails are the affordance, and
    // a scrollbar under one row of images is just noise in a chat message.
    expect(rail.className).toContain("screenRail");
    expect(rail.style.scrollbarWidth).toBe("none");
  });

  it("offers each screen, not only the first", () => {
    render(
      <DesignTurnBubbles
        turn={turnWith([
          built("50000000-0000-4000-8000-0000000000a1", "My Inspections"),
          built("50000000-0000-4000-8000-0000000000a2", "Profile"),
          built("50000000-0000-4000-8000-0000000000a3", "Saved Listings"),
        ])}
        currentUserId="10000000-0000-4000-8000-000000000001"
        currentUserName="Owner"
        onPreview={() => {}}
      />,
    );

    for (const name of ["My Inspections", "Profile", "Saved Listings"]) {
      expect(
        screen.getByRole("button", { name: `View ${name}` }),
      ).toBeInTheDocument();
    }
  });

  it("opens the screen that was actually clicked", async () => {
    const onPreview = vi.fn();
    render(
      <DesignTurnBubbles
        turn={turnWith([
          built("50000000-0000-4000-8000-0000000000a1", "My Inspections"),
          built("50000000-0000-4000-8000-0000000000a2", "Profile"),
        ])}
        currentUserId="10000000-0000-4000-8000-000000000001"
        currentUserName="Owner"
        onPreview={onPreview}
      />,
    );

    screen.getByRole("button", { name: "View Profile" }).click();
    expect(onPreview).toHaveBeenCalledWith("50000000-0000-4000-8000-0000000000a2");
  });
});

describe("stopping a generation that is still running", () => {
  const runningTurn = (): DesignAgentTurn => ({
    ...turnWith([built("50000000-0000-4000-8000-0000000000a1", "Explore")]),
    taskStatus: "running",
    screenState: "empty",
    currentVersionId: null,
  });

  it("offers a way to stop while it is still designing", () => {
    render(
      <DesignTurnBubbles
        turn={runningTurn()}
        currentUserId="10000000-0000-4000-8000-000000000001"
        currentUserName="Owner"
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /stop/i })).toBeInTheDocument();
  });

  it("stops the task it belongs to", () => {
    const onCancel = vitest.fn();
    render(
      <DesignTurnBubbles
        turn={runningTurn()}
        currentUserId="10000000-0000-4000-8000-000000000001"
        currentUserName="Owner"
        onCancel={onCancel}
      />,
    );
    screen.getByRole("button", { name: /stop/i }).click();
    expect(onCancel).toHaveBeenCalledWith("70000000-0000-4000-8000-000000000007");
  });

  it("offers nothing to stop once the run has finished", () => {
    render(
      <DesignTurnBubbles
        turn={turnWith([built("50000000-0000-4000-8000-0000000000a1", "Explore")])}
        currentUserId="10000000-0000-4000-8000-000000000001"
        currentUserName="Owner"
        onCancel={() => {}}
        onPreview={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: /stop/i })).not.toBeInTheDocument();
  });
});
