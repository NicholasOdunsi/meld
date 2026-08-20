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

it("is draggable so a row can be dropped where the caller chooses", () => {
  renderToolbar();

  expect(screen.getByRole("button", { name: "PRD" })).toHaveAttribute(
    "draggable",
    "true",
  );
});

it("starts a drag when dragging begins", () => {
  const onDragStart = vi.fn();
  renderToolbar({ onDragStart });

  fireEvent.dragStart(screen.getByRole("button", { name: "PRD" }));

  expect(onDragStart).toHaveBeenCalledOnce();
});

it("refuses to drag a row that cannot be placed", () => {
  const onDragStart = vi.fn();
  renderToolbar({
    isDisabled: true,
    disabledReason: "Four is the most a tab holds.",
    onDragStart,
  });

  const item = screen.getByRole("button", { name: "PRD" });
  expect(item).not.toHaveAttribute("draggable", "true");

  fireEvent.dragStart(item);

  expect(onDragStart).not.toHaveBeenCalled();
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
