// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MeldBot, type MeldBotVariant } from "./meld-bot";

afterEach(cleanup);

const PARTS = [
  "antenna",
  "head",
  "torso",
  "left-arm",
  "right-arm",
  "left-leg",
  "right-leg",
] as const;

describe.each([
  ["meld", "var(--color-on-dark)", "var(--color-on-light)"],
  ["product", "var(--color-icon-pink)", "var(--color-on-dark)"],
  ["research", "var(--color-icon-teal)", "var(--color-on-dark)"],
] as const)("%s Meld bot", (variant, bodyColor, detailColor) => {
  it("renders the shared pixel geometry and approved palette", () => {
    render(
      <MeldBot
        variant={variant as MeldBotVariant}
        data-testid="meld-bot"
      />,
    );

    const bot = screen.getByTestId("meld-bot");
    expect(bot).toHaveAttribute("viewBox", "0 0 36 36");
    expect(bot).toHaveAttribute("shape-rendering", "crispEdges");
    expect(bot).toHaveAttribute("data-variant", variant);
    expect(bot).toHaveAttribute("aria-hidden", "true");

    for (const part of PARTS) {
      expect(
        within(bot).getByTestId(`meld-bot-${part}`),
      ).toBeInTheDocument();
    }

    expect(
      within(bot).getAllByTestId("meld-bot-body-tone")[0],
    ).toHaveAttribute("fill", bodyColor);
    expect(
      within(bot).getAllByTestId("meld-bot-detail-tone")[0],
    ).toHaveAttribute("fill", detailColor);
  });
});

it("allows an accessible parent to own the bot name", () => {
  render(
    <section role="img" aria-label="Product Agent">
      <MeldBot variant="product" />
    </section>,
  );

  expect(
    screen.getByRole("img", { name: "Product Agent" }),
  ).toBeVisible();
});

it("renders a head-only appearance without body parts", () => {
  render(
    <MeldBot
      variant="product"
      appearance="head"
      data-testid="meld-bot"
    />,
  );

  const bot = screen.getByTestId("meld-bot");
  expect(bot).toHaveAttribute("data-appearance", "head");
  expect(within(bot).getByTestId("meld-bot-antenna")).toBeVisible();
  expect(within(bot).getByTestId("meld-bot-head")).toBeVisible();
  expect(
    within(bot).queryByTestId("meld-bot-torso"),
  ).not.toBeInTheDocument();
  expect(
    within(bot).queryByTestId("meld-bot-left-leg"),
  ).not.toBeInTheDocument();
});

it.each([-1, 0, 1] as const)(
  "moves the pupils by %i SVG unit",
  (eyeOffset) => {
    render(
      <MeldBot
        appearance="head"
        eyeOffset={eyeOffset}
        data-testid="meld-bot"
      />,
    );

    expect(screen.getByTestId("meld-bot-eyes")).toHaveAttribute(
      "transform",
      `translate(${eyeOffset} 0)`,
    );
  },
);
