// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { MeldButton } from "./button";

afterEach(cleanup);

it("exposes the label as the accessible name", () => {
  render(<MeldButton label="Send magic link" />);

  expect(
    screen.getByRole("button", { name: "Send magic link" }),
  ).toBeInTheDocument();
});

it("defaults to type=button so it cannot submit a form by accident", () => {
  render(<MeldButton label="Cancel" />);

  expect(screen.getByRole("button")).toHaveAttribute("type", "button");
});

it("passes through an explicit submit type", () => {
  render(<MeldButton label="Save" type="submit" />);

  expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
});

it("blocks interaction while loading and marks itself busy", async () => {
  const onClick = vi.fn();
  render(<MeldButton label="Saving" isLoading onClick={onClick} />);

  const button = screen.getByRole("button");
  expect(button).toBeDisabled();
  expect(button).toHaveAttribute("aria-busy", "true");

  await userEvent.click(button, { pointerEventsCheck: 0 });
  expect(onClick).not.toHaveBeenCalled();
});

it("omits aria-busy when idle", () => {
  render(<MeldButton label="Idle" />);

  expect(screen.getByRole("button")).not.toHaveAttribute("aria-busy");
});

it("disables independently of loading", () => {
  render(<MeldButton label="Blocked" isDisabled />);

  const button = screen.getByRole("button");
  expect(button).toBeDisabled();
  expect(button).not.toHaveAttribute("aria-busy");
});

it("fires onClick when enabled", async () => {
  const onClick = vi.fn();
  render(<MeldButton label="Go" onClick={onClick} />);

  await userEvent.click(screen.getByRole("button"));
  expect(onClick).toHaveBeenCalledOnce();
});

it("renders an icon before the label", () => {
  render(
    <MeldButton
      label="Sign in"
      icon={<svg data-testid="google-mark" aria-hidden />}
    />,
  );

  const button = screen.getByRole("button", { name: "Sign in" });
  expect(button.firstChild).toBe(screen.getByTestId("google-mark"));
});

it("forwards form submission attributes", () => {
  render(<MeldButton label="Next" name="next" value="/rooms" />);

  const button = screen.getByRole("button");
  expect(button).toHaveAttribute("name", "next");
  expect(button).toHaveAttribute("value", "/rooms");
});

it("reflects variant and size as data attributes for stable targeting", () => {
  render(<MeldButton label="Send magic link" variant="secondary" size="lg" />);

  const button = screen.getByRole("button");
  expect(button).toHaveAttribute("data-variant", "secondary");
  expect(button).toHaveAttribute("data-size", "lg");
});

it("defaults to the primary md pairing", () => {
  render(<MeldButton label="Go" />);

  const button = screen.getByRole("button");
  expect(button).toHaveAttribute("data-variant", "primary");
  expect(button).toHaveAttribute("data-size", "md");
});
