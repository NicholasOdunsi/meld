// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MeldAuthShell } from "./auth-shell";

afterEach(cleanup);

it("renders the title as the page heading", () => {
  render(<MeldAuthShell title="Create your workspace." />);

  expect(
    screen.getByRole("heading", { level: 1, name: "Create your workspace." }),
  ).toBeInTheDocument();
});

it("renders a string subtitle under the title", () => {
  render(<MeldAuthShell title="Sign in" subtitle="Use your work email" />);

  expect(screen.getByText("Use your work email")).toBeInTheDocument();
});

it("passes a node subtitle straight through, unwrapped", () => {
  // The setup screen needs its own live region, so a node subtitle must not be
  // wrapped in the shell's own <p>.
  render(
    <MeldAuthShell
      title="Setting up"
      subtitle={<p aria-live="polite">Rotating tip</p>}
    />,
  );

  const tip = screen.getByText("Rotating tip");
  expect(tip).toHaveAttribute("aria-live", "polite");
});

it("carries the pixel field on every screen built from it", () => {
  const { container } = render(<MeldAuthShell title="Anything" />);

  // The field is the only svg with a grid of cells.
  expect(container.querySelectorAll("[data-cell]").length).toBeGreaterThan(0);
});

it("shows the Meld mark by default and yields it to a crest", () => {
  const { container, rerender } = render(<MeldAuthShell title="Sign in" />);
  expect(container.querySelector("svg[aria-hidden]")).toBeInTheDocument();

  rerender(
    <MeldAuthShell title="Sign in" crest={<img alt="Mascot" src="/m.png" />} />,
  );
  expect(screen.getByAltText("Mascot")).toBeInTheDocument();
});

it("renders the banner above the body", () => {
  render(
    <MeldAuthShell title="Sign in" banner={<p>Something went wrong</p>}>
      <button type="button">Retry</button>
    </MeldAuthShell>,
  );

  const banner = screen.getByText("Something went wrong");
  const body = screen.getByRole("button", { name: "Retry" });
  expect(
    banner.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});
