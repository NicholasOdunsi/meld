// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ShortcutLine } from "./shortcut-line";

afterEach(cleanup);

it("advertises only the shortcuts that exist", () => {
  render(<ShortcutLine />);

  expect(screen.getByText("⌘N")).toBeInTheDocument();
  expect(screen.getByText("New project")).toBeInTheDocument();
  expect(screen.getByText("⌘K")).toBeInTheDocument();
  expect(screen.getByText("Ask anything")).toBeInTheDocument();
});

it("does not advertise a scratch room, which does not exist yet", () => {
  render(<ShortcutLine />);

  expect(screen.queryByText("⇧⌘N")).toBeNull();
});
