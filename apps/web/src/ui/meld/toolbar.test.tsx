// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PixelClipboard } from "@/ui/pixel-icons";
import {
  MeldToolbar,
  MeldToolbarItem,
  type MeldToolbarCorner,
} from "./toolbar";

afterEach(cleanup);

function renderToolbar(props: Partial<Parameters<typeof MeldToolbarItem>[0]> = {}) {
  return render(
    <MeldToolbar isCollapsed={false} onCollapsedChange={() => {}}>
      <MeldToolbarItem
        label="PRD"
        icon={<PixelClipboard pack="basic" size="sm" />}
        state="idle"
        onSelect={() => {}}
        {...props}
      />
    </MeldToolbar>,
  );
}

it("shows the label when open", () => {
  renderToolbar();

  expect(screen.getByRole("button", { name: "PRD" })).toBeInTheDocument();
});

it.each(["idle", "open", "active"] as const)(
  "reflects the %s state for stable targeting",
  (state) => {
    renderToolbar({ state });

    expect(screen.getByRole("button", { name: "PRD" })).toHaveAttribute(
      "data-state",
      state,
    );
  },
);

it("places the tool when pressed", async () => {
  const onSelect = vi.fn();
  renderToolbar({ onSelect });

  await userEvent.click(screen.getByRole("button", { name: "PRD" }));

  expect(onSelect).toHaveBeenCalledOnce();
});

it("places the tool from the keyboard", async () => {
  const onSelect = vi.fn();
  renderToolbar({ onSelect });

  screen.getByRole("button", { name: "PRD" }).focus();
  await userEvent.keyboard("{Enter}");

  expect(onSelect).toHaveBeenCalledOnce();
});

// Dragging is pointer events, not native HTML5 DnD -- native drag on a
// <button> proved browser-dependent (no ghost at all in some Chromium
// forks), so the row only arms the caller's pointer-drag state machine.
it("arms a pointer drag when pressed", () => {
  const onDragPointerDown = vi.fn();
  renderToolbar({ onDragPointerDown });

  fireEvent.pointerDown(screen.getByRole("button", { name: "PRD" }));

  expect(onDragPointerDown).toHaveBeenCalledOnce();
});

it("does not arm a drag on a disabled row", () => {
  const onDragPointerDown = vi.fn();
  renderToolbar({
    isDisabled: true,
    disabledReason: "Four is the most a tab holds.",
    onDragPointerDown,
  });

  fireEvent.pointerDown(screen.getByRole("button", { name: "PRD" }));

  expect(onDragPointerDown).not.toHaveBeenCalled();
});

it("explains why a tool cannot be placed", () => {
  renderToolbar({
    isDisabled: true,
    disabledReason: "Four is the most a tab holds.",
  });

  const item = screen.getByRole("button", { name: "PRD" });
  expect(item).toBeDisabled();
  expect(item).toHaveAccessibleDescription("Four is the most a tab holds.");
});

it("does not describe or disable a row that can be placed", () => {
  renderToolbar();

  const item = screen.getByRole("button", { name: "PRD" });
  expect(item).not.toBeDisabled();
  expect(item).not.toHaveAttribute("aria-describedby");
});

it("names the collapse control for its collapsed and expanded states, but never both", () => {
  const { rerender } = render(
    <MeldToolbar isCollapsed={false} onCollapsedChange={() => {}}>
      {null}
    </MeldToolbar>,
  );

  expect(
    screen.getByRole("button", { name: "Collapse toolbar" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Expand toolbar" }),
  ).not.toBeInTheDocument();

  rerender(
    <MeldToolbar isCollapsed onCollapsedChange={() => {}}>
      {null}
    </MeldToolbar>,
  );

  expect(
    screen.getByRole("button", { name: "Expand toolbar" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Collapse toolbar" }),
  ).not.toBeInTheDocument();
});

it("keeps the label available to assistive tech when collapsed", () => {
  render(
    <MeldToolbar isCollapsed onCollapsedChange={() => {}}>
      <MeldToolbarItem
        label="PRD"
        icon={<PixelClipboard pack="basic" size="sm" />}
        state="idle"
        onSelect={() => {}}
      />
    </MeldToolbar>,
  );

  expect(screen.getByRole("button", { name: "PRD" })).toBeInTheDocument();
});

it("collapses and expands", async () => {
  const onCollapsedChange = vi.fn();
  render(
    <MeldToolbar isCollapsed={false} onCollapsedChange={onCollapsedChange}>
      {null}
    </MeldToolbar>,
  );

  await userEvent.click(screen.getByRole("button", { name: "Collapse toolbar" }));

  expect(onCollapsedChange).toHaveBeenCalledWith(true);
});

describe("corner picker", () => {
  function renderWithCorners(corner: MeldToolbarCorner = "top-start") {
    const onCornerChange = vi.fn();
    render(
      <MeldToolbar
        isCollapsed={false}
        onCollapsedChange={() => {}}
        corner={corner}
        onCornerChange={onCornerChange}
      >
        <MeldToolbarItem label="Canvas" icon={null} state="idle" onSelect={() => {}} />
      </MeldToolbar>,
    );
    return { onCornerChange };
  }

  it("offers all four corners", () => {
    renderWithCorners();

    expect(
      within(screen.getByTestId("toolbar-corners")).getAllByRole("button"),
    ).toHaveLength(4);
  });

  // The filled quadrant is the only thing saying where the panel is, so it has
  // to be the pressed one -- the control is a diagram, not a set of actions.
  it("marks the corner it is parked in as pressed", () => {
    renderWithCorners("bottom-end");

    expect(
      screen.getByRole("button", { name: "Move toolbar to the bottom right" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "Move toolbar to the top left" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("reports the corner the reader picked", () => {
    const { onCornerChange } = renderWithCorners();

    fireEvent.click(
      screen.getByRole("button", { name: "Move toolbar to the top right" }),
    );

    expect(onCornerChange).toHaveBeenCalledWith("top-end");
  });

  // Collapsed the panel is a strip of icons with no room for a second control,
  // and the collapse toggle takes the whole header.
  it("hides the picker when collapsed", () => {
    render(
      <MeldToolbar
        isCollapsed
        onCollapsedChange={() => {}}
        corner="top-start"
        onCornerChange={() => {}}
      >
        <MeldToolbarItem label="Canvas" icon={null} state="idle" onSelect={() => {}} />
      </MeldToolbar>,
    );

    expect(screen.queryByTestId("toolbar-corners")).not.toBeInTheDocument();
  });

  it("hides the picker when the caller does not offer moving", () => {
    render(
      <MeldToolbar isCollapsed={false} onCollapsedChange={() => {}}>
        <MeldToolbarItem label="Canvas" icon={null} state="idle" onSelect={() => {}} />
      </MeldToolbar>,
    );

    expect(screen.queryByTestId("toolbar-corners")).not.toBeInTheDocument();
  });
});
