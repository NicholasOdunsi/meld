// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PrototypeViewer } from "./prototype-viewer";

afterEach(cleanup);

describe("PrototypeViewer", () => {
  it("renders prototype HTML with only the required sandbox capability", () => {
    const html = "<!doctype html><html><body>Prototype</body></html>";

    render(<PrototypeViewer html={html} screenCount={2} />);

    const frame = screen.getByTitle("Prototype preview (2 screens)");
    expect(frame).toHaveAttribute("sandbox", "allow-scripts");
    expect(frame.getAttribute("sandbox")).not.toContain("allow-same-origin");
    expect(frame).toHaveAttribute("srcdoc", html);
  });

  it("renders guidance instead of an iframe when no prototype is built", () => {
    render(<PrototypeViewer html={null} screenCount={0} />);

    expect(screen.getByText("No screens built yet")).toBeVisible();
    expect(
      screen.getByText("Generate a screen to see the prototype."),
    ).toBeVisible();
    expect(screen.queryByTitle(/Prototype preview/)).not.toBeInTheDocument();
  });
});
