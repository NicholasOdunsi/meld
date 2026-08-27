// @vitest-environment jsdom

import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CanvasScreenSelection } from "@/features/canvas/use-canvas-selection";
import {
  renderComposer,
  setupComposerTestEnvironment,
} from "./composer-test-harness";

setupComposerTestEnvironment();

const framed = (targetScreenId: string | null, shapes = 0): CanvasScreenSelection => ({
  targetScreenId,
  frame: { x: 0, y: 0, w: 390, h: 844 },
  sketchShapes: Array.from({ length: shapes }, () => ({
    kind: "rectangle" as const,
    x: 0,
    y: 0,
    w: 10,
    h: 10,
    text: null,
  })),
});

describe("the composer shows what is selected on the canvas", () => {
  it("names each selected screen, so you can see what you are about to edit", () => {
    renderComposer({
      canvasSelection: [framed("screen-a"), framed("screen-b")],
      canvasScreenNames: new Map([
        ["screen-a", "Explore Verified Homes"],
        ["screen-b", "Saved Listings"],
      ]),
    });

    const chips = screen.getByTestId("composer-canvas-selection");
    expect(chips).toHaveTextContent("Explore Verified Homes");
    expect(chips).toHaveTextContent("Saved Listings");
  });

  it("calls a sketch with no screen behind it a new screen", () => {
    renderComposer({ canvasSelection: [framed(null)] });
    expect(screen.getByTestId("composer-canvas-selection")).toHaveTextContent(
      "New screen",
    );
  });

  it("says when a selection carries a sketch to follow", () => {
    renderComposer({
      canvasSelection: [framed("screen-a", 3)],
      canvasScreenNames: new Map([["screen-a", "Explore"]]),
    });
    expect(screen.getByTestId("composer-canvas-selection")).toHaveTextContent(
      /sketch/i,
    );
  });

  it("shows nothing at all when nothing is selected", () => {
    renderComposer({ canvasSelection: [] });
    expect(
      screen.queryByTestId("composer-canvas-selection"),
    ).not.toBeInTheDocument();
  });
});
