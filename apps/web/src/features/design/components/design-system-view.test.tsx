// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DesignProfile } from "@meld/contracts";

const mocks = vi.hoisted(() => ({ startComponentBuild: vi.fn() }));
vi.mock("../component-build", () => ({
  startComponentBuild: mocks.startComponentBuild,
}));

import { DesignSystemView } from "./design-system-view";

const ROOM_ID = "20000000-0000-4000-8000-000000000001";

afterEach(cleanup);
beforeEach(() => {
  mocks.startComponentBuild.mockReset();
});

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

  it("shows a build button labeled with the remaining count when a room and provider are resolved", () => {
    const data = {
      profile: profile({
        components: [
          { name: "card", rules: "Elevated container with padding." },
          { name: "chip", rules: "Compact status label." },
        ],
      }),
      tokenCss: "",
      componentCss: "",
    };

    render(<DesignSystemView data={data} roomId={ROOM_ID} provider="claude" />);

    expect(
      screen.getByRole("button", { name: "Build 2 remaining components" }),
    ).toBeVisible();
  });

  it("hides the build button once every component already has html", () => {
    const data = {
      profile: profile(),
      tokenCss: "",
      componentCss: "",
    };

    render(<DesignSystemView data={data} roomId={ROOM_ID} provider="claude" />);

    expect(screen.queryByText(/remaining components/)).not.toBeInTheDocument();
  });

  it("hides the build button when no room has been resolved", () => {
    const data = {
      profile: profile({
        components: [{ name: "card", rules: "Elevated container with padding." }],
      }),
      tokenCss: "",
      componentCss: "",
    };

    render(<DesignSystemView data={data} provider="claude" />);

    expect(screen.queryByText(/remaining components/)).not.toBeInTheDocument();
  });

  it("hides the build button when no ready provider has been resolved", () => {
    const data = {
      profile: profile({
        components: [{ name: "card", rules: "Elevated container with padding." }],
      }),
      tokenCss: "",
      componentCss: "",
    };

    render(<DesignSystemView data={data} roomId={ROOM_ID} />);

    expect(screen.queryByText(/remaining components/)).not.toBeInTheDocument();
  });

  it("starts a build pass with the resolved room and provider -- never a hardcoded one -- and reports the outcome", async () => {
    mocks.startComponentBuild.mockResolvedValue({ status: "started" });
    const data = {
      profile: profile({
        components: [{ name: "card", rules: "Elevated container with padding." }],
      }),
      tokenCss: "",
      componentCss: "",
    };

    render(<DesignSystemView data={data} roomId={ROOM_ID} provider="claude" />);
    fireEvent.click(screen.getByRole("button", { name: "Build 1 remaining components" }));

    expect(mocks.startComponentBuild).toHaveBeenCalledWith(ROOM_ID, "claude");
    await waitFor(() =>
      expect(screen.getByText(/Building the rest of your components/)).toBeVisible(),
    );
  });

  it("shows the refusal message without touching the database error", async () => {
    mocks.startComponentBuild.mockResolvedValue({
      status: "error",
      message: "Upload a design system before building its components.",
    });
    const data = {
      profile: profile({
        components: [{ name: "card", rules: "Elevated container with padding." }],
      }),
      tokenCss: "",
      componentCss: "",
    };

    render(<DesignSystemView data={data} roomId={ROOM_ID} provider="claude" />);
    fireEvent.click(screen.getByRole("button", { name: "Build 1 remaining components" }));

    await waitFor(() =>
      expect(
        screen.getByText("Upload a design system before building its components."),
      ).toBeVisible(),
    );
  });
});
