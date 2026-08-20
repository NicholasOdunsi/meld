// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { DeckShortcuts } from "./deck-shortcuts";

afterEach(cleanup);

it("asks for a new project on command-N", async () => {
  const user = userEvent.setup();
  const onNewProject = vi.fn();
  render(<DeckShortcuts onNewProject={onNewProject} />);

  await user.keyboard("{Meta>}n{/Meta}");

  expect(onNewProject).toHaveBeenCalledTimes(1);
});

it("focuses the prompt on command-K", async () => {
  const user = userEvent.setup();
  const input = document.createElement("input");
  input.id = "deck-prompt";
  document.body.append(input);

  render(<DeckShortcuts onNewProject={vi.fn()} />);
  await user.keyboard("{Meta>}k{/Meta}");

  expect(document.activeElement).toBe(input);

  input.remove();
});

it("ignores an unmodified keypress", async () => {
  const user = userEvent.setup();
  const onNewProject = vi.fn();
  render(<DeckShortcuts onNewProject={onNewProject} />);

  await user.keyboard("n");

  expect(onNewProject).not.toHaveBeenCalled();
});
