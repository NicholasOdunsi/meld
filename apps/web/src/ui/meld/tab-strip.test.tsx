// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { MeldTab, MeldTabStrip } from "./tab-strip";

afterEach(cleanup);

function renderStrip(overrides: { onActivate?: () => void; onAdd?: () => void } = {}) {
  return render(
    <MeldTabStrip
      activeTabId="checkout"
      onActivate={overrides.onActivate ?? (() => {})}
      onAdd={overrides.onAdd ?? (() => {})}
    >
      <MeldTab tabId="overview" label="Overview" variant="generated" />
      <MeldTab tabId="checkout" label="Checkout" variant="workstream" isClosable />
      <MeldTab tabId="empty" label="Empty states" variant="workstream" isClosable />
    </MeldTabStrip>,
  );
}

it("is a tablist with the active tab selected", () => {
  renderStrip();

  expect(screen.getByRole("tablist")).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Checkout" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute(
    "aria-selected",
    "false",
  );
});

it("marks the generated tab so it reads as built, not placed", () => {
  renderStrip();

  expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute(
    "data-variant",
    "generated",
  );
});

it("activates a tab when pressed", async () => {
  const onActivate = vi.fn();
  renderStrip({ onActivate });

  await userEvent.click(screen.getByRole("tab", { name: "Empty states" }));

  expect(onActivate).toHaveBeenCalledWith("empty");
});

it("moves between tabs with arrow keys", async () => {
  renderStrip();

  screen.getByRole("tab", { name: "Checkout" }).focus();
  await userEvent.keyboard("{ArrowRight}");

  expect(screen.getByRole("tab", { name: "Empty states" })).toHaveFocus();
});

it("starts a new tab", async () => {
  const onAdd = vi.fn();
  renderStrip({ onAdd });

  await userEvent.click(screen.getByRole("button", { name: "New tab" }));

  expect(onAdd).toHaveBeenCalledOnce();
});

it("can omit the new-tab control for a read-only participant", () => {
  render(
    <MeldTabStrip
      activeTabId="checkout"
      onActivate={() => {}}
      showAddButton={false}
    >
      <MeldTab tabId="checkout" label="Checkout" variant="workstream" />
    </MeldTabStrip>,
  );

  expect(screen.queryByRole("button", { name: "New tab" })).toBeNull();
});

it("gives the generated tab no close control", () => {
  renderStrip();

  expect(screen.queryByRole("button", { name: "Close Overview" })).toBeNull();
  expect(screen.getByRole("button", { name: "Close Checkout" })).toBeInTheDocument();
});

it("renders the presence slot", () => {
  render(
    <MeldTabStrip
      activeTabId="a"
      onActivate={() => {}}
      onAdd={() => {}}
      presence={<span>who is here</span>}
    >
      <MeldTab tabId="a" label="A" variant="workstream" />
    </MeldTabStrip>,
  );

  expect(screen.getByText("who is here")).toBeInTheDocument();
});

// ---- Beyond the brief -----------------------------------------------------

it("wraps focus from the last tab to the first on ArrowRight", async () => {
  renderStrip();

  screen.getByRole("tab", { name: "Empty states" }).focus();
  await userEvent.keyboard("{ArrowRight}");

  expect(screen.getByRole("tab", { name: "Overview" })).toHaveFocus();
});

it("wraps focus from the first tab to the last on ArrowLeft", async () => {
  renderStrip();

  screen.getByRole("tab", { name: "Overview" }).focus();
  await userEvent.keyboard("{ArrowLeft}");

  expect(screen.getByRole("tab", { name: "Empty states" })).toHaveFocus();
});

it("jumps to the last tab on End and the first on Home", async () => {
  renderStrip();

  screen.getByRole("tab", { name: "Checkout" }).focus();
  await userEvent.keyboard("{End}");
  expect(screen.getByRole("tab", { name: "Empty states" })).toHaveFocus();

  await userEvent.keyboard("{Home}");
  expect(screen.getByRole("tab", { name: "Overview" })).toHaveFocus();
});

// Manual, not automatic, activation: arrow/Home/End only move focus. Without
// this pair of tests, someone could quietly add `onActivate(tabId)` inside
// the keydown handler -- turning the strip automatic -- and every other test
// in this file (which only asserts `toHaveFocus()`) would stay green.
it("never activates a tab from Arrow, Home, or End -- focus only, manual activation", async () => {
  const onActivate = vi.fn();
  renderStrip({ onActivate });

  screen.getByRole("tab", { name: "Checkout" }).focus();
  await userEvent.keyboard("{ArrowRight}{ArrowLeft}{Home}{End}");

  expect(onActivate).not.toHaveBeenCalled();
});

it("activates the focused tab on Enter or Space", async () => {
  const onActivate = vi.fn();
  renderStrip({ onActivate });

  screen.getByRole("tab", { name: "Empty states" }).focus();
  await userEvent.keyboard("{Enter}");
  expect(onActivate).toHaveBeenCalledWith("empty");

  onActivate.mockClear();
  screen.getByRole("tab", { name: "Empty states" }).focus();
  await userEvent.keyboard(" ");
  expect(onActivate).toHaveBeenCalledWith("empty");
});

it("only tabs the active tab into the sequential tab order", () => {
  renderStrip();

  expect(screen.getByRole("tab", { name: "Checkout" })).toHaveAttribute("tabIndex", "0");
  expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("tabIndex", "-1");
  expect(screen.getByRole("tab", { name: "Empty states" })).toHaveAttribute("tabIndex", "-1");
});

it("renames a workstream tab on double-click, committing on Enter", async () => {
  const onRename = vi.fn();
  render(
    <MeldTabStrip activeTabId="checkout" onActivate={() => {}} onAdd={() => {}}>
      <MeldTab
        tabId="checkout"
        label="Checkout"
        variant="workstream"
        onRename={onRename}
      />
    </MeldTabStrip>,
  );

  await userEvent.dblClick(screen.getByText("Checkout"));
  const input = screen.getByDisplayValue("Checkout");
  await userEvent.clear(input);
  await userEvent.type(input, "Guest checkout{Enter}");

  // The primitive is dumb: it reports the commit but does not adopt the new
  // label itself. Redisplaying "Guest checkout" is on the caller, which
  // would feed it back in as a new `label` prop -- not exercised by this
  // isolated render, so the tab reverts to the `label` it was given.
  expect(onRename).toHaveBeenCalledWith("Guest checkout");
  expect(screen.getByRole("tab", { name: "Checkout" })).toBeInTheDocument();
});

it("commits a rename on blur", async () => {
  const onRename = vi.fn();
  render(
    <MeldTabStrip activeTabId="checkout" onActivate={() => {}} onAdd={() => {}}>
      <MeldTab
        tabId="checkout"
        label="Checkout"
        variant="workstream"
        onRename={onRename}
      />
      <button type="button">elsewhere</button>
    </MeldTabStrip>,
  );

  await userEvent.dblClick(screen.getByText("Checkout"));
  const input = screen.getByDisplayValue("Checkout");
  await userEvent.clear(input);
  await userEvent.type(input, "Renamed on blur");
  await userEvent.click(screen.getByRole("button", { name: "elsewhere" }));

  expect(onRename).toHaveBeenCalledWith("Renamed on blur");
});

it("cancels a rename on Escape without committing", async () => {
  const onRename = vi.fn();
  render(
    <MeldTabStrip activeTabId="checkout" onActivate={() => {}} onAdd={() => {}}>
      <MeldTab
        tabId="checkout"
        label="Checkout"
        variant="workstream"
        onRename={onRename}
      />
    </MeldTabStrip>,
  );

  await userEvent.dblClick(screen.getByText("Checkout"));
  const input = screen.getByDisplayValue("Checkout");
  await userEvent.clear(input);
  await userEvent.type(input, "Should not stick");
  await userEvent.keyboard("{Escape}");

  expect(onRename).not.toHaveBeenCalled();
  expect(screen.getByRole("tab", { name: "Checkout" })).toBeInTheDocument();
  expect(screen.queryByDisplayValue("Should not stick")).toBeNull();
});

it("does not let the generated tab be renamed", async () => {
  const onRename = vi.fn();
  render(
    <MeldTabStrip activeTabId="overview" onActivate={() => {}} onAdd={() => {}}>
      <MeldTab
        tabId="overview"
        label="Overview"
        variant="generated"
        onRename={onRename}
      />
    </MeldTabStrip>,
  );

  await userEvent.dblClick(screen.getByText("Overview"));

  expect(screen.queryByDisplayValue("Overview")).toBeNull();
  expect(screen.getByRole("tab", { name: "Overview" })).toBeInTheDocument();
});

it("still gives the generated tab no close control even if isClosable is passed", () => {
  render(
    <MeldTabStrip activeTabId="overview" onActivate={() => {}} onAdd={() => {}}>
      <MeldTab tabId="overview" label="Overview" variant="generated" isClosable />
    </MeldTabStrip>,
  );

  expect(screen.queryByRole("button", { name: "Close Overview" })).toBeNull();
});

// ---- Focus preservation on close -------------------------------------

it("moves focus to the previous tab when closing the middle tab", async () => {
  render(
    <MeldTabStrip activeTabId="b" onActivate={() => {}} onAdd={() => {}}>
      <MeldTab tabId="a" label="A" variant="workstream" isClosable />
      <MeldTab tabId="b" label="B" variant="workstream" isClosable />
      <MeldTab tabId="c" label="C" variant="workstream" isClosable />
    </MeldTabStrip>,
  );

  screen.getByRole("button", { name: "Close B" }).focus();
  await userEvent.click(screen.getByRole("button", { name: "Close B" }));

  expect(screen.getByRole("tab", { name: "A" })).toHaveFocus();
});

it("moves focus to the next tab when closing the first tab", async () => {
  render(
    <MeldTabStrip activeTabId="a" onActivate={() => {}} onAdd={() => {}}>
      <MeldTab tabId="a" label="A" variant="workstream" isClosable />
      <MeldTab tabId="b" label="B" variant="workstream" isClosable />
    </MeldTabStrip>,
  );

  await userEvent.click(screen.getByRole("button", { name: "Close A" }));

  expect(screen.getByRole("tab", { name: "B" })).toHaveFocus();
});

it("falls back to the New tab button when closing the only tab", async () => {
  render(
    <MeldTabStrip activeTabId="a" onActivate={() => {}} onAdd={() => {}}>
      <MeldTab tabId="a" label="A" variant="workstream" isClosable />
    </MeldTabStrip>,
  );

  await userEvent.click(screen.getByRole("button", { name: "Close A" }));

  expect(screen.getByRole("button", { name: "New tab" })).toHaveFocus();
});

// ---- The rename/activate interaction is deliberate ---------------------

it("activates the tab it renames, since you can't rename a tab you can't see", async () => {
  const onActivate = vi.fn();
  render(
    <MeldTabStrip activeTabId="checkout" onActivate={onActivate} onAdd={() => {}}>
      <MeldTab tabId="checkout" label="Checkout" variant="workstream" />
      <MeldTab
        tabId="empty"
        label="Empty states"
        variant="workstream"
        onRename={() => {}}
      />
    </MeldTabStrip>,
  );

  await userEvent.dblClick(screen.getByText("Empty states"));

  expect(onActivate).toHaveBeenCalledWith("empty");
  expect(screen.getByDisplayValue("Empty states")).toBeInTheDocument();
});

it("accepts a drop on the New tab button", () => {
  const onDropOnAdd = vi.fn();
  render(
    <MeldTabStrip
      activeTabId="a"
      onActivate={() => {}}
      onAdd={() => {}}
      onDropOnAdd={onDropOnAdd}
    >
      <MeldTab tabId="a" label="A" variant="workstream" />
    </MeldTabStrip>,
  );

  const addButton = screen.getByRole("button", { name: "New tab" });
  fireEvent.drop(addButton);

  expect(onDropOnAdd).toHaveBeenCalledOnce();
});
