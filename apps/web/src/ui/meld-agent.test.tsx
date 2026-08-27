// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MeldAgent, MELD_AGENT_ASSETS } from "./meld-agent";

afterEach(cleanup);

it("maps each current agent variant to a stable sprite asset", () => {
  for (const [variant, sprite] of [
    ["meld", "central-teal"],
    ["product", "pink-stretch"],
    ["research", "lime-squat"],
    ["design", "purple-pocket"],
  ] as const) {
    const { unmount } = render(
      <MeldAgent variant={variant} data-testid={`${variant}-agent`} />,
    );
    const image = screen.getByTestId(`${variant}-agent`);
    expect(image).toHaveAttribute("src", MELD_AGENT_ASSETS[sprite]);
    expect(image).toHaveAttribute("data-variant", variant);
    expect(image).toHaveAttribute("data-sprite", sprite);
    unmount();
  }
});

it("allows an individual cast member to be selected", () => {
  render(
    <MeldAgent
      variant="research"
      sprite="blue-lanky"
      appearance="head"
      eyeOffset={-1}
      data-testid="agent"
    />,
  );

  const image = screen.getByTestId("agent");
  expect(image).toHaveAttribute("src", "/agents/blue-lanky.svg");
  expect(image).toHaveAttribute("data-appearance", "head");
  expect(image).toHaveAttribute("data-eye-offset", "-1");
  expect(image).toHaveAttribute("aria-hidden", "true");
});
