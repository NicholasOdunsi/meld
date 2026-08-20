// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MeldWatermark } from "./watermark";

afterEach(cleanup);

it("shows the workspace name", () => {
  render(<MeldWatermark workspaceName="Nicholas' Studio" />);

  expect(screen.getByText("Nicholas' Studio")).toBeInTheDocument();
});

it("is hidden from assistive technology", () => {
  render(<MeldWatermark workspaceName="Nicholas' Studio" />);

  expect(screen.getByTestId("deck-watermark")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
});
