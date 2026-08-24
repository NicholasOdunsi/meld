// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { PixelClipboard } from "@/ui/pixel-icons";
import { MeldToolbar, MeldToolbarItem } from "./toolbar";

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
