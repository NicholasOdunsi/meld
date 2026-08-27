// @vitest-environment jsdom

/**
 * Room-plane probe: does the user-flow canvas -- one of the two heaviest pane
 * surfaces -- survive being mounted in a quadrant-sized region?
 *
 * jsdom can only answer half of that question, and for the canvas it answers
 * even less: see the FINDING below. The real-browser look is recorded in
 * docs/superpowers/specs/2026-08-20-room-freeform-canvas-design.md under
 * "Width probe".
 */

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { UserFlowTrialTab } from "./user-flow-trial-tab-loader";

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
 * FINDING: the real tldraw canvas cannot be probed in jsdom, at two separate
 * layers -- neither is fit to commit as a passing test, so both are recorded
 * here instead.
 *
 * 1. Module load never settles. `UserFlowTrialTab` (the loader) wraps its real
 *    content in `next/dynamic(..., { ssr: false })`. With
 *    `requestCanvasSession` stubbed to never resolve (so the tree should land
 *    on the "Connecting to Canvas" branch), the tree stayed on next/dynamic's
 *    own "Loading Canvas" fallback for a full 5s `waitFor` timeout in
 *    vitest+jsdom and never progressed further -- i.e. the dynamic import of
 *    `./user-flow-trial-tab` (which statically imports
 *    `./user-flow-trial-canvas`, and therefore `tldraw`) did not resolve
 *    within the test run at all.
 *
 * 2. Even when the module load is sidestepped -- a local, uncommitted
 *    experiment resolved `requestCanvasSession` synchronously enough for React
 *    to reach the real `<UserFlowTrialCanvas>` -> `<Tldraw>` render -- jsdom
 *    logged "Not implemented: HTMLCanvasElement's getContext() method: without
 *    installing the canvas npm package" (this repo has no `canvas` package),
 *    the render tree collapsed to an empty container, and the test hung past a
 *    5s timeout rather than settling cleanly.
 *
 * This matches how every other test in this codebase that touches tldraw
 * handles it: user-flow-trial-canvas.test.tsx and its .e2e.test.tsx sibling
 * both `vi.mock("tldraw", ...)` and `vi.mock("@tldraw/sync", ...)` wholesale
 * rather than rendering the real library.
 */
it.skip("real tldraw canvas mount is not exercised here -- see the FINDING comment above", () => {
  // Intentionally empty. Kept as a signpost so a future reader who searches
  // this file for "tldraw" lands on the explanation, not just the mocks. If
  // this is ever unskipped, mount through `quadrantContainer()` like every
  // other case in this file -- not raw JSX markup -- so the raw-element
  // convention holds even for a probe.
});
