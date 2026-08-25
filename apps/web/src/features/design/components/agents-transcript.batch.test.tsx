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
    editedExisting: false,
    initiatedBy: "10000000-0000-4000-8000-000000000001",
    taskStatus: "completed",
    screenState: "built",
    currentVersionId: screens[0].currentVersionId,
    createdAt: "2026-08-23T00:00:00.000Z",
    chainId: null,
    chainTotal: 0,
  };
}

/**
 * A grouped turn mid-chain (or finished): `total` screens were named when the
 * chain began, `built` of them have landed so far. Mirrors what
 * `groupDesignTurnsBySend` hands `DesignTurnBubbles` -- chainTotal frozen at
 * the chain's start, chainId shared across every run in it.
 */
function chainTurn({
  built: builtCount,
  total,
  taskStatus,
}: {
  built: number;
  total: number;
  taskStatus: DesignAgentTurn["taskStatus"];
}): DesignAgentTurn {
  const screens = Array.from({ length: builtCount }, (_, index) =>
    built(
      `50000000-0000-4000-8000-0000000000${(index + 1).toString(16).padStart(2, "0")}`,
      `Screen ${index + 1}`,
    ),
  );
  const finished = taskStatus === "completed";
  return {
    ...turnWith(screens),
    taskStatus,
    screenState: finished ? "built" : "empty",
    currentVersionId: finished ? screens[screens.length - 1].currentVersionId : null,
    chainId: "c1",
    chainTotal: total,
  };
}

function renderTurns(turns: readonly DesignAgentTurn[]) {
  render(
    <>
      {turns.map((turn) => (
        <DesignTurnBubbles
          key={turn.taskId}
          turn={turn}
          currentUserId="10000000-0000-4000-8000-000000000001"
          currentUserName="Owner"
          onPreview={() => {}}
          onCancel={() => {}}
        />
      ))}
    </>,
  );
}

describe("a chain says how far along it is", () => {
it("counts the seconds while a generation is running", () => {
  // A run takes minutes. The wave alone says nothing about how long, so a
  // slow one is indistinguishable from a stuck one -- which is exactly the
  // suspicion this removes. Same counter the Product Agent already shows.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-25T14:00:12Z"));
  try {
    renderTurns([
      {
        ...turnWith([built("s1", "Home")]),
        taskStatus: "running",
        createdAt: "2026-08-25T14:00:00.000Z",
      },
    ]);
    expect(screen.getByText("12s")).toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});

it("shows no counter once the generation has settled", () => {
  // A settled turn must not leave an interval ticking, and a frozen number
  // beside a finished reply reads as still-running.
  renderTurns([
    {
      ...turnWith([built("s1", "Home")]),
      taskStatus: "completed",
      createdAt: "2026-08-25T14:00:00.000Z",
    },
  ]);
  expect(screen.queryByText(/^\d+s$/)).not.toBeInTheDocument();
});

  it("says how far through a chain it is while it is still going", () => {
    // Screens appearing a few at a time IS the progress indicator -- it is real
    // output, not an animation. The count is the honest version of a spinner.
    renderTurns([
      chainTurn({ built: 4, total: 9, taskStatus: "running" }),
    ]);
    expect(screen.getByText(/Built 4 of 9/)).toBeInTheDocument();
    expect(screen.getByText(/building the next/i)).toBeInTheDocument();
  });

  it("drops the counter once the chain has finished", () => {
    renderTurns([chainTurn({ built: 9, total: 9, taskStatus: "completed" })]);
    expect(screen.getByText(/Built 9 screens/)).toBeInTheDocument();
    expect(screen.queryByText(/building the next/i)).not.toBeInTheDocument();
  });

  it("says plainly when the ceiling stopped it early", () => {
    // Never silently truncate: eight screens when eleven were named has to read
    // as a stopping point with a way forward, not as success.
    renderTurns([chainTurn({ built: 8, total: 11, taskStatus: "completed" })]);
    expect(screen.getByText(/Built 8 of 11/)).toBeInTheDocument();
    expect(screen.getByText(/Ask again to continue/)).toBeInTheDocument();
  });
});

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

  it("shows when it started, the same as a finished reply does", () => {
    // The time was hidden while running, so a generation in flight was the one
    // thing in the feed with no timestamp -- and a long one is exactly when
    // you want to know how long it has been going.
    render(
      <DesignTurnBubbles
        turn={runningTurn()}
        currentUserId="10000000-0000-4000-8000-000000000001"
        currentUserName="Owner"
        onCancel={() => {}}
      />,
    );
    const reply = screen.getByTestId(
      "agents-turn-reply-70000000-0000-4000-8000-000000000007",
    );
    expect(reply).toHaveTextContent(/\d{1,2}:\d{2}/);
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
    const cancel = screen.getByRole("button", { name: /cancel/i });
    expect(cancel).toBeInTheDocument();
    // Quiet: stopping is the exception, so it should not compete with the
    // screens beside it.
    expect(cancel.className).toMatch(/ghost/i);
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
    screen.getByRole("button", { name: /cancel/i }).click();
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
    expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
  });
});

describe("what the request itself shows", () => {
  it("shows the Design Agent it was addressed to, like a Product Agent message does", () => {
    // The mention is stripped before the instruction is sent, so the stored
    // prompt is bare words -- and the request read as if it had gone nowhere in
    // particular, unlike a @Product Agent message which keeps its chip.
    render(
      <DesignTurnBubbles
        turn={turnWith([built("50000000-0000-4000-8000-0000000000a1", "Explore")])}
        currentUserId="10000000-0000-4000-8000-000000000001"
        currentUserName="Owner"
        onPreview={() => {}}
      />,
    );
    const prompt = screen.getByTestId(
      "agents-turn-prompt-70000000-0000-4000-8000-000000000007",
    );
    // A pill in the agent's own colour, the same Badge a @Product Agent
    // mention renders as -- not bare styled text beside the words.
    // Asserted the way the composer's own mention tests do: the Badge carries
    // its hue as data-variant, and design shares the product agent's purple.
    expect(screen.getByText("@Design Agent")).toHaveAttribute(
      "data-variant",
      "purple",
    );
    expect(prompt).toHaveTextContent("use green instead of red");
  });

  it("shows the screens the request was aimed at", () => {
    render(
      <DesignTurnBubbles
        turn={{
          ...turnWith([
            built("50000000-0000-4000-8000-0000000000a1", "Explore"),
            built("50000000-0000-4000-8000-0000000000a2", "Saved"),
          ]),
          editedExisting: true,
        }}
        currentUserId="10000000-0000-4000-8000-000000000001"
        currentUserName="Owner"
        onPreview={() => {}}
      />,
    );
    const attached = screen.getByTestId("agents-turn-attached-screens");
    expect(attached).toHaveTextContent("Explore");
    expect(attached).toHaveTextContent("Saved");
  });

  it("attaches nothing when the request built something new", () => {
    // A screen created from scratch was not selected -- showing its name back
    // as an attachment would claim the person picked something they did not.
    render(
      <DesignTurnBubbles
        turn={turnWith([built("50000000-0000-4000-8000-0000000000a1", "Explore")])}
        currentUserId="10000000-0000-4000-8000-000000000001"
        currentUserName="Owner"
        onPreview={() => {}}
      />,
    );
    expect(
      screen.queryByTestId("agents-turn-attached-screens"),
    ).not.toBeInTheDocument();
  });
});
