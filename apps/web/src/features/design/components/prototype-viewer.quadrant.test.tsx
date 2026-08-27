// @vitest-environment jsdom

/**
 * Room-plane probe: does the prototype viewer -- one of the two heaviest pane
 * surfaces -- survive being mounted in a quadrant-sized region?
 *
 * jsdom can only answer half of that question. It has no real layout or paint
 * engine, so "mounts without throwing" is the ceiling of what this file can
 * prove; it says nothing about legibility or reachable controls. That part of
 * the finding comes from a real-browser look, recorded in
 * docs/superpowers/specs/2026-08-20-room-freeform-canvas-design.md under
 * "Width probe".
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PrototypeViewer } from "./prototype-viewer";

// The quadrant at the 1060px reference width, in CSS pixels. This test file is
// a probe, not shipped UI, so raw numbers here are fine.
const QUADRANT = { width: 420, height: 260 };

// `apps/web/src/features/` files may not own raw markup for layout (only
// `apps/web/src/ui/meld/` may) -- so a fixed-size mount node is built with
// `document.createElement`, not JSX, and handed to Testing Library as the
// `container` option. This is the standard Testing Library mechanism for
// controlling the mount node; it isn't a workaround.
let mountNode: HTMLElement | null = null;

function quadrantContainer(): HTMLElement {
  mountNode = document.createElement("div");
  mountNode.style.width = `${QUADRANT.width}px`;
  mountNode.style.height = `${QUADRANT.height}px`;
  document.body.appendChild(mountNode);
  return mountNode;
}

afterEach(() => {
  cleanup();
  mountNode?.remove();
  mountNode = null;
});

const SCREENS = [
  { id: "s1", name: "Register", formFactor: "desktop" as const },
  { id: "s2", name: "Sign In", formFactor: "desktop" as const },
];

describe("PrototypeViewer at quadrant size", () => {
  it("mounts a built prototype without throwing", () => {
    const html = "<!doctype html><html><body>Prototype</body></html>";

    const host = quadrantContainer();
    render(<PrototypeViewer html={html} screenCount={2} screens={SCREENS} />, {
      container: host,
    });

    expect(host.firstChild).not.toBeNull();
    // A loaded prototype renders as a bare iframe -- its visible content lives
    // inside the sandboxed srcDoc, which jsdom never parses into the host
    // document, so `textContent` is legitimately empty here. The markup itself
    // (and the frame element below) is the "non-empty output" this probe cares
    // about.
    expect(host.innerHTML).not.toBe("");
    expect(
      host.querySelector('[data-testid="prototype-frame-wrapper"] iframe'),
    ).toBeInTheDocument();
  });

  it("mounts the empty state without throwing", () => {
    const host = quadrantContainer();
    render(<PrototypeViewer html={null} screenCount={0} screens={[]} />, {
      container: host,
    });

    expect(host.firstChild).not.toBeNull();
    expect(host.textContent).not.toBe("");
    expect(screen.getByText("No screens built yet")).toBeInTheDocument();
  });
});
