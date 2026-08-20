// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

let prefersReducedMotion = false;

// Overrides the shared always-false matchMedia from vitest.setup.ts: this
// suite toggles prefers-reduced-motion per test via the flag above.
vi.stubGlobal(
  "matchMedia",
  vi.fn().mockImplementation((query: string) => ({
    matches:
      query === "(prefers-reduced-motion: reduce)" && prefersReducedMotion,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
);

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  wipeOnComplete: null as (() => void) | null,
}));

const router = {
  replace: mocks.replace,
  prefetch: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
};

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

// The wipe's own animation timing has its own test suite
// (`reveal-wipe.test.tsx`); here it's stubbed to a hook capturing
// `onComplete`, tracked via an effect so the flag reflects whether it's
// actually mounted rather than a transient first paint.
vi.mock("@/ui/meld/reveal-wipe", () => ({
  MeldRevealWipe: ({ onComplete }: { onComplete: () => void }) => {
    useEffect(() => {
      mocks.wipeOnComplete = onComplete;
      return () => {
        mocks.wipeOnComplete = null;
      };
    }, [onComplete]);
    return null;
  },
}));

import {
  useWorkspaceReveal,
  WorkspaceRevealProvider,
} from "./workspace-reveal-provider";

const DESTINATION = "/30000000-0000-4000-8000-000000000003";

function RevealOnMount({ destination }: { destination: string }) {
  const { reveal } = useWorkspaceReveal();
  useEffect(() => {
    reveal(destination);
    // Fires once per mount -- tests control timing by mounting/unmounting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function renderAndReveal(destination = DESTINATION) {
  return render(
    <WorkspaceRevealProvider>
      <RevealOnMount destination={destination} />
    </WorkspaceRevealProvider>,
  );
}

beforeEach(() => {
  prefersReducedMotion = false;
  mocks.replace.mockClear();
  mocks.wipeOnComplete = null;
});

afterEach(() => {
  cleanup();
});

it("navigates the instant reveal is called, not after the animation", () => {
  renderAndReveal();

  // The destination starts loading immediately -- see the comment on
  // `reveal` for why this ordering is the whole point.
  expect(mocks.replace).toHaveBeenCalledWith(DESTINATION);
});

it("mounts the wipe transition once active", () => {
  renderAndReveal();

  expect(mocks.wipeOnComplete).toBeInstanceOf(Function);
});

it("still navigates but skips the wipe transition entirely under reduced motion", () => {
  prefersReducedMotion = true;

  renderAndReveal();

  expect(mocks.replace).toHaveBeenCalledWith(DESTINATION);
  expect(mocks.wipeOnComplete).toBeNull();
});

it("unmounts the wipe transition once it reports completion", () => {
  renderAndReveal();

  expect(mocks.wipeOnComplete).toBeInstanceOf(Function);

  act(() => {
    mocks.wipeOnComplete?.();
  });

  expect(mocks.wipeOnComplete).toBeNull();
});
