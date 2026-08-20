// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { MeldDock } from "./dock";

afterEach(cleanup);

it("shows only the composer at rest", () => {
  render(
    <MeldDock
      isExpanded={false}
      onExpandedChange={() => {}}
      composer={<span>ask anything</span>}
    >
      <span>the transcript</span>
    </MeldDock>,
  );

  expect(screen.getByText("ask anything")).toBeInTheDocument();
  expect(screen.queryByText("the transcript")).toBeNull();
});

it("shows the conversation when expanded", () => {
  render(
    <MeldDock
      isExpanded
      onExpandedChange={() => {}}
      composer={<span>ask anything</span>}
    >
      <span>the transcript</span>
    </MeldDock>,
  );

  expect(screen.getByText("the transcript")).toBeInTheDocument();
});

it("tells assistive tech whether it is open", () => {
  render(
    <MeldDock isExpanded={false} onExpandedChange={() => {}} composer={null}>
      {null}
    </MeldDock>,
  );

  expect(
    screen.getByRole("button", { name: "Show conversation" }),
  ).toHaveAttribute("aria-expanded", "false");
});

it("expands when asked", async () => {
  const onExpandedChange = vi.fn();
  render(
    <MeldDock
      isExpanded={false}
      onExpandedChange={onExpandedChange}
      composer={null}
    >
      {null}
    </MeldDock>,
  );

  await userEvent.click(
    screen.getByRole("button", { name: "Show conversation" }),
  );

  expect(onExpandedChange).toHaveBeenCalledWith(true);
});

it("collapses on Escape", async () => {
  const onExpandedChange = vi.fn();
  render(
    <MeldDock isExpanded onExpandedChange={onExpandedChange} composer={null}>
      {null}
    </MeldDock>,
  );

  await userEvent.keyboard("{Escape}");

  expect(onExpandedChange).toHaveBeenCalledWith(false);
});

it("reflects its state for stable targeting", () => {
  render(
    <MeldDock isExpanded onExpandedChange={() => {}} composer={null}>
      {null}
    </MeldDock>,
  );

  expect(screen.getByTestId("dock")).toHaveAttribute("data-expanded", "true");
});
