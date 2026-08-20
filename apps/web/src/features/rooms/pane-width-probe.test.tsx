// @vitest-environment jsdom

/**
 * Task 6 probe: do the two heaviest pane surfaces -- the prototype viewer and
 * the user-flow canvas -- survive being mounted in a quadrant-sized region?
 *
 * jsdom can only answer half of that question. It has no real layout or
 * paint engine, so "mounts without throwing" is the ceiling of what this
 * file can prove; it says nothing about legibility or reachable controls.
 * That part of the finding comes from a real-browser look, recorded in
 * docs/superpowers/specs/2026-08-20-room-freeform-canvas-design.md under
 * "Width probe".
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PrototypeViewer } from "@/features/design/components/prototype-viewer";
import { UserFlowTrialTab } from "@/features/canvas/user-flow-trial-tab-loader";

// The quadrant at the 1060px reference width, in CSS pixels. This test file
// is a probe, not shipped UI, so raw numbers here are fine.
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

describe("PrototypeViewer at quadrant size", () => {
  it("mounts a built prototype without throwing", () => {
    const html = "<!doctype html><html><body>Prototype</body></html>";

    const host = quadrantContainer();
    render(<PrototypeViewer html={html} screenCount={2} />, {
      container: host,
    });

    expect(host.firstChild).not.toBeNull();
    // A loaded prototype renders as a bare iframe -- its visible content
    // lives inside the sandboxed srcDoc, which jsdom never parses into the
    // host document, so `textContent` is legitimately empty here. The
    // markup itself (and the frame element below) is the "non-empty
    // output" this probe cares about.
    expect(host.innerHTML).not.toBe("");
    expect(screen.getByTitle("Prototype preview (2 screens)")).toBeInTheDocument();
  });

  it("mounts the empty state without throwing", () => {
    const host = quadrantContainer();
    render(<PrototypeViewer html={null} screenCount={0} />, {
      container: host,
    });

    expect(host.firstChild).not.toBeNull();
    expect(host.textContent).not.toBe("");
    expect(screen.getByText("No screens built yet")).toBeInTheDocument();
  });
});

describe("UserFlowTrialTab (canvas) at quadrant size", () => {
  const minimalProps = {
    workspaceId: "30000000-0000-4000-8000-000000000003",
    roomId: "40000000-0000-4000-8000-000000000004",
    currentUser: { id: "10000000-0000-4000-8000-000000000001", name: "Owner" },
  };

  it("mounts the unavailable-trial chrome without throwing", () => {
    const host = quadrantContainer();
    render(<UserFlowTrialTab {...minimalProps} trialEnabled={false} />, {
      container: host,
    });

    expect(host.firstChild).not.toBeNull();
    expect(host.textContent).not.toBe("");
  });
});

/**
 * FINDING (Step 1): the real tldraw canvas cannot be probed in jsdom, at
 * two separate layers -- neither is fit to commit as a passing test, so
 * both are recorded here instead.
 *
 * 1. Module load never settles. `UserFlowTrialTab` (the loader) wraps its
 *    real content in `next/dynamic(..., { ssr: false })`. With
 *    `requestCanvasSession` stubbed to never resolve (so the tree should
 *    land on the "Connecting to Canvas" branch), the tree stayed on
 *    next/dynamic's own "Loading Canvas" fallback for a full 5s
 *    `waitFor` timeout in vitest+jsdom and never progressed further --
 *    i.e. the dynamic import of `./user-flow-trial-tab` (which statically
 *    imports `./user-flow-trial-canvas`, and therefore `tldraw`) did not
 *    resolve within the test run at all.
 *
 * 2. Even when the module load is sidestepped -- a local, uncommitted
 *    experiment resolved `requestCanvasSession` synchronously enough for
 *    React to reach the real `<UserFlowTrialCanvas>` -> `<Tldraw>` render
 *    -- jsdom logged "Not implemented: HTMLCanvasElement's getContext()
 *    method: without installing the canvas npm package" (this repo has no
 *    `canvas` package), the render tree collapsed to an empty container,
 *    and the test hung past a 5s timeout rather than settling cleanly.
 *
 * This matches how every other test in this codebase that touches tldraw
 * handles it: user-flow-trial-canvas.test.tsx and its .e2e.test.tsx
 * sibling both `vi.mock("tldraw", ...)` and `vi.mock("@tldraw/sync", ...)`
 * wholesale rather than rendering the real library.
 *
 * Per the brief: "If a component cannot be mounted in jsdom at all (canvas
 * APIs, ResizeObserver), that is itself a finding — record it and move to
 * Step 2." This is that record. The real-browser probe (Step 2, written up
 * in docs/superpowers/specs/2026-08-20-room-freeform-canvas-design.md
 * under "Width probe") is what actually answers whether the canvas is
 * usable at quadrant size -- this file cannot.
 */
it.skip("real tldraw canvas mount is not exercised here -- see the FINDING comment above", () => {
  // Intentionally empty. Kept as a signpost so a future reader who searches
  // this file for "tldraw" lands on the explanation, not just the mocks.
  // If this is ever unskipped, mount through `quadrantContainer()` like
  // every other case in this file -- not raw JSX markup -- so the
  // raw-element convention holds even for a probe.
});
