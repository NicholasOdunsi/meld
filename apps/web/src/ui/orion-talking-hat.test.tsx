// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { OrionTalkingHat } from "./orion-talking-hat";

afterEach(cleanup);

it.each(["neutral", "curious", "speaking"] as const)(
  "renders the %s expression with the same hat silhouette",
  (expression) => {
    render(<OrionTalkingHat expression={expression} />);
    const hat = screen.getByRole("img", { name: "Orion talking hat" });
    expect(hat).toHaveAttribute("data-expression", expression);
    expect(hat.querySelector('[data-part="crown"]')).toBeInTheDocument();
    expect(hat.querySelector('[data-part="brim"]')).toBeInTheDocument();
    expect(hat.querySelector('[data-part="mouth"]')).toBeInTheDocument();
  },
);

it("uses the simplified face at avatar size", () => {
  render(<OrionTalkingHat appearance="avatar" width={48} height={48} />);
  const hat = screen.getByRole("img", { name: "Orion talking hat" });
  expect(hat).toHaveAttribute("data-appearance", "avatar");
  expect(hat.querySelector('[data-part="grain"]')).not.toBeInTheDocument();
  expect(hat).toHaveAttribute("width", "48");
});

it("supports custom labels and decorative use", () => {
  const { rerender } = render(<OrionTalkingHat aria-label="A wise hat" />);
  expect(screen.getByRole("img", { name: "A wise hat" })).toBeInTheDocument();
  rerender(<OrionTalkingHat decorative data-testid="decorative-hat" />);
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByTestId("decorative-hat")).toHaveAttribute("aria-hidden", "true");
});

it("scopes gradients to each instance and disables speaking motion when requested", () => {
  render(
    <>
      <OrionTalkingHat expression="speaking" data-testid="first-hat" />
      <OrionTalkingHat expression="speaking" data-testid="second-hat" />
    </>,
  );
  const first = screen.getByTestId("first-hat");
  const second = screen.getByTestId("second-hat");
  expect(first.querySelector("linearGradient")?.id).not.toBe(
    second.querySelector("linearGradient")?.id,
  );
  expect(first.querySelector("style")?.textContent).toContain("prefers-reduced-motion: reduce");
});
