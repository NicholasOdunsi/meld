// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { MeldPane } from "./pane";

afterEach(cleanup);

const REGION = {
  columnStart: 1,
  columnEnd: 2,
  rowStart: 1,
  rowEnd: 3,
} as const;

it("names the pane by its tool", () => {
  render(
    <MeldPane title="PRD" region={REGION} onClose={() => {}} onPopOut={() => {}}>
      <span>body</span>
    </MeldPane>,
  );

  expect(screen.getByRole("region", { name: "PRD" })).toBeInTheDocument();
  expect(screen.getByText("body")).toBeInTheDocument();
});

it("places itself on the plane's grid", () => {
  render(
    <MeldPane title="PRD" region={REGION} onClose={() => {}} onPopOut={() => {}}>
      {null}
    </MeldPane>,
  );

  const pane = screen.getByRole("region", { name: "PRD" });
  expect(pane).toHaveStyle({ gridColumnStart: "1", gridRowEnd: "3" });
});

it("reflects focus for stable targeting", () => {
  render(
    <MeldPane title="PRD" region={REGION} isFocused onClose={() => {}} onPopOut={() => {}}>
      {null}
    </MeldPane>,
  );

  expect(screen.getByRole("region", { name: "PRD" })).toHaveAttribute(
    "data-focused",
    "true",
  );
});

it("defaults to unfocused when isFocused is omitted", () => {
  render(
    <MeldPane title="PRD" region={REGION} onClose={() => {}} onPopOut={() => {}}>
      {null}
    </MeldPane>,
  );

  expect(screen.getByRole("region", { name: "PRD" })).toHaveAttribute(
    "data-focused",
    "false",
  );
});

it("closes when asked", async () => {
  const onClose = vi.fn();
  render(
    <MeldPane title="PRD" region={REGION} onClose={onClose} onPopOut={() => {}}>
      {null}
    </MeldPane>,
  );

  await userEvent.click(screen.getByRole("button", { name: "Close PRD" }));

  expect(onClose).toHaveBeenCalledOnce();
});

it("pops out to a new tab when asked", async () => {
  const onPopOut = vi.fn();
  render(
    <MeldPane title="PRD" region={REGION} onClose={() => {}} onPopOut={onPopOut}>
      {null}
    </MeldPane>,
  );

  await userEvent.click(
    screen.getByRole("button", { name: "Open PRD in a new tab" }),
  );

  expect(onPopOut).toHaveBeenCalledOnce();
});

it("has exactly the two named controls and no others", () => {
  render(
    <MeldPane title="PRD" region={REGION} onClose={() => {}} onPopOut={() => {}}>
      {null}
    </MeldPane>,
  );

  expect(screen.getAllByRole("button")).toHaveLength(2);
});

it("omits the close control for a read-only pane", () => {
  render(
    <MeldPane
      title="PRD"
      region={REGION}
      isClosable={false}
      onPopOut={() => {}}
    >
      {null}
    </MeldPane>,
  );

  expect(screen.queryByRole("button", { name: "Close PRD" })).toBeNull();
  expect(
    screen.getByRole("button", { name: "Open PRD in a new tab" }),
  ).toBeInTheDocument();
});

it("omits the pop-out control for a read-only pane", () => {
  render(
    <MeldPane
      title="PRD"
      region={REGION}
      isClosable={false}
      isPopOutable={false}
    >
      {null}
    </MeldPane>,
  );

  expect(
    screen.queryByRole("button", { name: "Open PRD in a new tab" }),
  ).toBeNull();
});
