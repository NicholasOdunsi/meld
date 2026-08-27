// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MeldAgentSprite } from "./agent-sprite";

afterEach(cleanup);

it("shows the caption", () => {
  render(<MeldAgentSprite agent="design" state="working" label="DESIGN · DRAWING" />);

  expect(screen.getByText("DESIGN · DRAWING")).toBeInTheDocument();
});

it("reflects state and agent for stable targeting", () => {
  render(<MeldAgentSprite agent="pm" state="waiting" label="PM · WAITING" />);

  const sprite = screen.getByTestId("agent-sprite");
  expect(sprite).toHaveAttribute("data-state", "waiting");
  expect(sprite).toHaveAttribute("data-agent", "pm");
});

it("only shows the activity meter while working", () => {
  const { rerender } = render(
    <MeldAgentSprite agent="design" state="working" label="DESIGN · DRAWING" />,
  );
  expect(screen.getByTestId("agent-meter")).toBeInTheDocument();

  rerender(<MeldAgentSprite agent="design" state="idle" label="DESIGN · IDLE" />);
  expect(screen.queryByTestId("agent-meter")).not.toBeInTheDocument();
});
