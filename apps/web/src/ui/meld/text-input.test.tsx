// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { MeldTextInput } from "./text-input";

afterEach(cleanup);

it("associates the visible label with the input", () => {
  render(<MeldTextInput label="Email address" />);

  expect(screen.getByLabelText("Email address")).toBeInTheDocument();
});

it("accepts typing and forwards the value", async () => {
  render(<MeldTextInput label="Email address" />);

  const input = screen.getByLabelText("Email address");
  await userEvent.type(input, "ada@example.com");

  expect(input).toHaveValue("ada@example.com");
});

it("marks itself invalid and describes the error", () => {
  render(
    <MeldTextInput label="Email address" errorMessage="Enter a valid email." />,
  );

  const input = screen.getByLabelText("Email address");
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveAccessibleDescription("Enter a valid email.");
});

it("describes the hint when there is no error", () => {
  render(<MeldTextInput label="Email address" hint="We'll send a link." />);

  const input = screen.getByLabelText("Email address");
  expect(input).not.toHaveAttribute("aria-invalid");
  expect(input).toHaveAccessibleDescription("We'll send a link.");
});

it("prefers the error over the hint", () => {
  render(
    <MeldTextInput
      label="Email address"
      hint="We'll send a link."
      errorMessage="Enter a valid email."
    />,
  );

  expect(screen.getByLabelText("Email address")).toHaveAccessibleDescription(
    "Enter a valid email.",
  );
  expect(screen.queryByText("We'll send a link.")).not.toBeInTheDocument();
});

it("has no description when neither hint nor error is set", () => {
  render(<MeldTextInput label="Email address" />);

  expect(screen.getByLabelText("Email address")).not.toHaveAttribute(
    "aria-describedby",
  );
});

it("disables the input", () => {
  render(<MeldTextInput label="Email address" isDisabled />);

  expect(screen.getByLabelText("Email address")).toBeDisabled();
});

it("gives each instance its own label association", () => {
  render(
    <>
      <MeldTextInput label="First" />
      <MeldTextInput label="Second" />
    </>,
  );

  const first = screen.getByLabelText("First");
  const second = screen.getByLabelText("Second");
  expect(first.id).not.toBe(second.id);
});

it("forwards input attributes", () => {
  render(
    <MeldTextInput
      label="Email address"
      type="email"
      name="email"
      placeholder="you@example.com"
    />,
  );

  const input = screen.getByLabelText("Email address");
  expect(input).toHaveAttribute("type", "email");
  expect(input).toHaveAttribute("name", "email");
  expect(input).toHaveAttribute("placeholder", "you@example.com");
});

it("reflects size as a data attribute for stable targeting", () => {
  render(<MeldTextInput label="Email address" inputSize="lg" />);

  expect(screen.getByLabelText("Email address")).toHaveAttribute(
    "data-size",
    "lg",
  );
});
