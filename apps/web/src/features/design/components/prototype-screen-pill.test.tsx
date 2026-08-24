// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrototypeScreenPill } from "./prototype-screen-pill";

const SCREENS = [
  { id: "s1", name: "Register", formFactor: "desktop" as const },
  { id: "s2", name: "Schedule Test", formFactor: "desktop" as const },
  { id: "s3", name: "Sign In", formFactor: "mobile" as const },
];

afterEach(cleanup);

describe("PrototypeScreenPill", () => {
  it("shows the screen you are on, and how many there are", () => {
    render(<PrototypeScreenPill screens={SCREENS} selectedId="s2" onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Schedule Test/ })).toBeInTheDocument();
    expect(screen.getByText(/3/)).toBeInTheDocument();
  });

  it("lists every screen when opened", () => {
    render(<PrototypeScreenPill screens={SCREENS} selectedId="s1" onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Register/ }));
    expect(screen.getByRole("menuitem", { name: /Sign In/ })).toBeInTheDocument();
  });

  it("reports the chosen screen and closes", () => {
    const onSelect = vi.fn();
    render(<PrototypeScreenPill screens={SCREENS} selectedId="s1" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Register/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Sign In/ }));
    expect(onSelect).toHaveBeenCalledWith("s3");
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
  });

  it("closes on Escape without selecting anything", () => {
    const onSelect = vi.fn();
    render(<PrototypeScreenPill screens={SCREENS} selectedId="s1" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Register/ }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("renders nothing for a single screen", () => {
    // A switcher that cannot switch is furniture in front of the design.
    const { container } = render(
      <PrototypeScreenPill screens={[SCREENS[0]]} selectedId="s1" onSelect={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("falls back to a neutral label when the selection is unknown", () => {
    // A deleted screen must not blank the pill or crash the pane.
    render(<PrototypeScreenPill screens={SCREENS} selectedId="gone" onSelect={vi.fn()} />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("gives a tablet screen its own thumbnail ratio instead of reusing desktop's", () => {
    const withTablet = [
      SCREENS[0],
      { id: "s4", name: "Tablet Home", formFactor: "tablet" as const },
    ];
    render(<PrototypeScreenPill screens={withTablet} selectedId="s1" onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Register/ }));

    const thumbnail = screen
      .getByRole("menuitem", { name: /Tablet Home/ })
      .querySelector<HTMLElement>('[style*="aspect-ratio"]');
    // 3/4 -- distinct from desktop's 16/10 (1.6) and mobile's 9/16 (0.5625).
    expect(thumbnail?.style.aspectRatio).toBe("0.75");
  });
});
