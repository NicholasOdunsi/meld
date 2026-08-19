// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { DesignProfile } from "@meld/contracts";
import { DesignSystemView } from "./design-system-view";

afterEach(cleanup);

function profile(overrides: Partial<DesignProfile> = {}): DesignProfile {
  return {
    colors: [{ name: "brand", value: "rebeccapurple" }],
    typeScale: [{ name: "body", px: 16 }],
    spacing: [{ name: "md", px: 16 }],
    radii: [{ name: "element", px: 8 }],
    components: [
      {
        name: "button",
        rules: "Primary action; solid fill; medium weight label.",
        html: '<button class="ds-button">Continue</button>',
        css: ".ds-button { font-weight: 700; }",
      },
    ],
    ...overrides,
  };
}

describe("DesignSystemView", () => {
  it("renders token swatches and a live component preview", () => {
    const data = {
      profile: profile(),
      tokenCss: ":root{--ds-color-brand:rebeccapurple;}",
      componentCss: ".ds-button{font-weight:600}",
    };

    render(<DesignSystemView data={data} />);

    expect(screen.getByText("brand")).toBeVisible();

    const frame = screen.getByTitle("button preview");
    expect(frame.tagName).toBe("IFRAME");
    expect(frame).toHaveAttribute("sandbox", "");
    const srcDoc = frame.getAttribute("srcdoc") ?? "";
    expect(srcDoc).toContain("ds-button");
    expect(srcDoc).toContain("Continue");
  });

  it("shows a chip for a component without generated html", () => {
    const data = {
      profile: profile({
        components: [
          { name: "card", rules: "Elevated container with padding." },
        ],
      }),
      tokenCss: "",
      componentCss: "",
    };

    render(<DesignSystemView data={data} />);

    expect(screen.getByText("card")).toBeVisible();
    expect(screen.getByText("Described, not generated")).toBeVisible();
    expect(screen.queryByTitle("card preview")).not.toBeInTheDocument();
  });

  it("renders an empty-state upload prompt when there is no design system yet", () => {
    render(<DesignSystemView data={null} />);

    expect(screen.getByText("No design system yet")).toBeVisible();
    expect(screen.queryByRole("iframe")).not.toBeInTheDocument();
  });
});
