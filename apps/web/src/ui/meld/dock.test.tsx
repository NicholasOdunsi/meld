// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MeldDock } from "./dock";

afterEach(cleanup);

// The dock used to take a `composer` slot, which the Room filled with a plain
// text input while `Conversation` -- the child -- rendered the real one. Two
// composers, only one of which could send. The child now supplies the single
// composer and the dock only frames it, so there is nothing here to assert
// about a composer at all; that is the point of these first two tests.
it("renders whatever the conversation gives it, collapsed or not", () => {
  const { rerender } = render(
    <MeldDock
      isExpanded={false}
      onExpandedChange={() => {}}
      isCollapsed={false}
      onCollapsedChange={() => {}}
      collapsedLabel="Ask anything"
    >
      <span>the one composer</span>
    </MeldDock>,
  );

  expect(screen.getByText("the one composer")).toBeInTheDocument();

  rerender(
    <MeldDock
      isExpanded
      onExpandedChange={() => {}}
      isCollapsed={false}
      onCollapsedChange={() => {}}
      collapsedLabel="Ask anything"
    >
      <span>the one composer</span>
    </MeldDock>,
  );

  expect(screen.getByText("the one composer")).toBeInTheDocument();
});

// Collapsed there is no transcript to hide, so offering a disclosure control
// would be offering a button that does nothing.
it("offers no hide control until there is something to hide", () => {
  const { rerender } = render(
    <MeldDock
      isExpanded={false}
      onExpandedChange={() => {}}
      isCollapsed={false}
      onCollapsedChange={() => {}}
      collapsedLabel="Ask anything"
    >
      {null}
    </MeldDock>,
  );

  expect(screen.queryByRole("button", { name: "Hide conversation" })).toBeNull();

  rerender(
    <MeldDock
      isExpanded
      onExpandedChange={() => {}}
      isCollapsed={false}
      onCollapsedChange={() => {}}
      collapsedLabel="Ask anything"
    >
      {null}
    </MeldDock>,
  );

  expect(
    screen.getByRole("button", { name: "Hide conversation" }),
  ).toHaveAttribute("aria-expanded", "true");
});

it("collapses when the hide control is pressed", async () => {
  const onExpandedChange = vi.fn();
  render(
    <MeldDock
      isExpanded
      onExpandedChange={onExpandedChange}
      isCollapsed={false}
      onCollapsedChange={() => {}}
      collapsedLabel="Ask anything"
    >
      {null}
    </MeldDock>,
  );

  await userEvent.click(
    screen.getByRole("button", { name: "Hide conversation" }),
  );

  expect(onExpandedChange).toHaveBeenCalledWith(false);
});

it("closes the transcript on Escape without collapsing the dock", async () => {
  const onExpandedChange = vi.fn();
  const onCollapsedChange = vi.fn();
  render(
    <MeldDock
      isExpanded
      onExpandedChange={onExpandedChange}
      isCollapsed={false}
      onCollapsedChange={onCollapsedChange}
      collapsedLabel="Ask anything"
    >
      {null}
    </MeldDock>,
  );

  await userEvent.keyboard("{Escape}");

  // Escape closes the transcript first, exactly as before -- the
  // composer-only collapse is a separate, lower state Escape reaches only
  // once there is no transcript left to close.
  expect(onExpandedChange).toHaveBeenCalledWith(false);
  expect(onCollapsedChange).not.toHaveBeenCalled();
});

it("collapses the dock to its pill on Escape once the composer is the only thing showing", async () => {
  const onCollapsedChange = vi.fn();
  render(
    <MeldDock
      isExpanded={false}
      onExpandedChange={() => {}}
      isCollapsed={false}
      onCollapsedChange={onCollapsedChange}
      collapsedLabel="Ask anything"
    >
      {null}
    </MeldDock>,
  );

  await userEvent.keyboard("{Escape}");

  // Routed through the same `onCollapsedChange` the "Collapse conversation"
  // control uses -- the caller's unsent-work guard applies to Escape too.
  expect(onCollapsedChange).toHaveBeenCalledWith(true);
});

// This listener attaches on mount, before any menu/popover/dialog exists, so
// it is first in `document`'s keydown listener order and runs before
// whatever opened later ever gets a chance to mark the event handled --
// checking `event.defaultPrevented` would not see a surface that opened
// after this component mounted. A live DOM check does not have that
// ordering problem.
it("does not collapse on Escape while a dismissible surface (e.g. a menu) is open", async () => {
  const onCollapsedChange = vi.fn();
  render(
    <>
      <div role="menu">Some open menu</div>
      <MeldDock
        isExpanded={false}
        onExpandedChange={() => {}}
        isCollapsed={false}
        onCollapsedChange={onCollapsedChange}
        collapsedLabel="Ask anything"
      >
        {null}
      </MeldDock>
    </>,
  );

  await userEvent.keyboard("{Escape}");

  expect(onCollapsedChange).not.toHaveBeenCalled();
});

it("collapses on Escape again once the dismissible surface closes", async () => {
  const onCollapsedChange = vi.fn();
  const { rerender } = render(
    <>
      <div role="menu">Some open menu</div>
      <MeldDock
        isExpanded={false}
        onExpandedChange={() => {}}
        isCollapsed={false}
        onCollapsedChange={onCollapsedChange}
        collapsedLabel="Ask anything"
      >
        {null}
      </MeldDock>
    </>,
  );

  rerender(
    <MeldDock
      isExpanded={false}
      onExpandedChange={() => {}}
      isCollapsed={false}
      onCollapsedChange={onCollapsedChange}
      collapsedLabel="Ask anything"
    >
      {null}
    </MeldDock>,
  );

  await userEvent.keyboard("{Escape}");

  expect(onCollapsedChange).toHaveBeenCalledWith(true);
});

// A hidden formatting menu (Tiptap's `BubbleMenu` toggles `style.visibility`
// rather than mounting/unmounting -- see `freeform-document-editor.tsx`)
// stays in the DOM at all times once the editor mounts. Presence alone would
// wrongly block every Escape in a room with a PRD document pane open.
it("ignores a dismissible-surface element that is present but hidden", async () => {
  const onCollapsedChange = vi.fn();
  render(
    <>
      <div role="menu" style={{ visibility: "hidden" }}>
        Hidden formatting menu
      </div>
      <MeldDock
        isExpanded={false}
        onExpandedChange={() => {}}
        isCollapsed={false}
        onCollapsedChange={onCollapsedChange}
        collapsedLabel="Ask anything"
      >
        {null}
      </MeldDock>
    </>,
  );

  await userEvent.keyboard("{Escape}");

  expect(onCollapsedChange).toHaveBeenCalledWith(true);
});

it("does nothing on Escape once the dock is already collapsed", async () => {
  const onCollapsedChange = vi.fn();
  const onExpandedChange = vi.fn();
  render(
    <MeldDock
      isExpanded={false}
      onExpandedChange={onExpandedChange}
      isCollapsed
      onCollapsedChange={onCollapsedChange}
      collapsedLabel="Ask anything"
    >
      {null}
    </MeldDock>,
  );

  await userEvent.keyboard("{Escape}");

  expect(onCollapsedChange).not.toHaveBeenCalled();
  expect(onExpandedChange).not.toHaveBeenCalled();
});

it("reflects its state for stable targeting", () => {
  render(
    <MeldDock
      isExpanded
      onExpandedChange={() => {}}
      isCollapsed={false}
      onCollapsedChange={() => {}}
      collapsedLabel="Ask anything"
    >
      {null}
    </MeldDock>,
  );

  expect(screen.getByTestId("dock")).toHaveAttribute("data-expanded", "true");
});

function renderDock(overrides: Partial<Parameters<typeof MeldDock>[0]> = {}) {
  const props = {
    isExpanded: false,
    onExpandedChange: vi.fn(),
    isCollapsed: false,
    onCollapsedChange: vi.fn(),
    collapsedLabel: "Ask anything",
    ...overrides,
  };
  render(
    <MeldDock {...props}>
      <textarea data-testid="composer" defaultValue="" />
    </MeldDock>,
  );
  return props;
}

describe("MeldDock collapsed state", () => {
  it("shows a pill with the label it was given", () => {
    renderDock({ isCollapsed: true });
    expect(screen.getByRole("button", { name: /Ask anything/ })).toBeInTheDocument();
  });

  it("never names an agent by default", () => {
    // The dock addresses Product, Research, Design or a teammate. Naming one
    // on the resting pill is wrong.
    renderDock({ isCollapsed: true });
    expect(screen.queryByText(/Design Agent/)).not.toBeInTheDocument();
  });

  it("keeps the composer mounted while collapsed, but hidden", () => {
    // Unmounting would destroy draft text, mentions and staged attachments --
    // it has to still be there. But it also has to actually be hidden: a
    // regression that dropped `hidden={isCollapsed}` would leave this
    // `toBeInTheDocument` assertion alone green while the composer sat in
    // plain view on top of the pill.
    renderDock({ isCollapsed: true });
    const composer = screen.getByTestId("composer");
    expect(composer).toBeInTheDocument();
    expect(composer).not.toBeVisible();
  });

  it("expands when the pill is clicked", () => {
    const props = renderDock({ isCollapsed: true });
    fireEvent.click(screen.getByRole("button", { name: /Ask anything/ }));
    expect(props.onCollapsedChange).toHaveBeenCalledWith(false);
  });

  it("shows no pill when it is not collapsed", () => {
    renderDock({ isCollapsed: false });
    expect(screen.queryByRole("button", { name: /Ask anything/ })).not.toBeInTheDocument();
  });

  it("marks the pill as a disclosure control for the conversation", () => {
    renderDock({ isCollapsed: true });
    const pill = screen.getByRole("button", { name: /Ask anything/ });
    expect(pill).toHaveAttribute("aria-expanded", "false");
    expect(pill).toHaveAttribute("aria-controls");
  });

  it("marks the section itself as collapsed for styling to hang off", () => {
    renderDock({ isCollapsed: true });
    expect(screen.getByTestId("dock")).toHaveAttribute("data-collapsed", "true");
  });

  it("offers a way back to the pill", () => {
    const props = renderDock({ isCollapsed: false });
    const collapseControl = screen.getByRole("button", {
      name: "Collapse conversation",
    });
    fireEvent.click(collapseControl);
    expect(props.onCollapsedChange).toHaveBeenCalledWith(true);
  });

  it("offers the way back to the pill even with no transcript to hide", () => {
    // "Hide conversation" only exists once there is a transcript
    // (`isExpanded`). Collapsing the whole dock has to be reachable
    // regardless -- there is no other way back to the pill.
    renderDock({ isCollapsed: false, isExpanded: false });
    expect(
      screen.getByRole("button", { name: "Collapse conversation" }),
    ).toBeInTheDocument();
  });

  it("moves focus to the pill when the dock collapses", async () => {
    // `MeldDock` is controlled -- collapsing removes the whole `.controls`
    // span, including whatever inside it held focus, and with nothing left
    // to receive it the browser resets focus to `document.body`. A real
    // stateful wrapper is needed here (not the `renderDock` helper's inert
    // `onCollapsedChange` stub) so the prop actually flips and the pill
    // actually mounts.
    function Wrapper() {
      const [isCollapsed, setIsCollapsed] = useState(false);
      return (
        <MeldDock
          isExpanded={false}
          onExpandedChange={() => {}}
          isCollapsed={isCollapsed}
          onCollapsedChange={setIsCollapsed}
          collapsedLabel="Ask anything"
        >
          {null}
        </MeldDock>
      );
    }
    render(<Wrapper />);

    fireEvent.click(
      screen.getByRole("button", { name: "Collapse conversation" }),
    );

    expect(
      screen.getByRole("button", { name: /Ask anything/ }),
    ).toHaveFocus();
  });

  it("marks the collapse control as disabled and explains why when collapsing is blocked", () => {
    renderDock({ isCollapsed: false, isCollapseDisabled: true });
    const collapseControl = screen.getByRole("button", {
      name: "Collapse conversation",
    });
    expect(collapseControl).toHaveAttribute("aria-disabled", "true");
    expect(collapseControl).toHaveAttribute("title");
  });

  it("leaves the collapse control undecorated when collapsing is allowed", () => {
    renderDock({ isCollapsed: false });
    const collapseControl = screen.getByRole("button", {
      name: "Collapse conversation",
    });
    expect(collapseControl).not.toHaveAttribute("aria-disabled");
    expect(collapseControl).not.toHaveAttribute("title");
  });
});
