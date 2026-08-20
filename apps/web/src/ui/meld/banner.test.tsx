// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MeldBanner } from "./banner";

afterEach(cleanup);

it("announces errors assertively", () => {
  render(<MeldBanner status="error" title="We could not send that link." />);

  const banner = screen.getByRole("alert");
  expect(banner).toHaveTextContent("We could not send that link.");
  expect(banner).toHaveAttribute("aria-live", "assertive");
});

it("announces success politely so it doesn't interrupt", () => {
  render(<MeldBanner status="success" title="Check your email." />);

  const banner = screen.getByRole("status");
  expect(banner).toHaveAttribute("aria-live", "polite");
});

it("reflects status for stable targeting", () => {
  const { container } = render(<MeldBanner status="info" title="Heads up." />);

  expect(container.querySelector("[data-status]")).toHaveAttribute(
    "data-status",
    "info",
  );
});
