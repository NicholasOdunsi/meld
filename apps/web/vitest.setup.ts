import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Shared jsdom shims for Astryx components. These were previously pasted
// into every rendering test (~240 identical lines across 14 files), which
// meant each new test opened with a wall of ceremony before its first
// assertion. Registered via `setupFiles`, so it runs before each test file.
//
// Node-environment test files load this too, hence the guards: jsdom
// globals like HTMLDialogElement simply do not exist there.

if (typeof window !== "undefined") {
  // Astryx reads matchMedia for its responsive breakpoints; jsdom has no
  // implementation at all.
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );

  // Resizable panels and overflow-aware components observe their own size.
  // Must be a real class (not `vi.fn().mockImplementation(...)`) — Astryx
  // invokes this with `new`, and a mock built from an arrow-function
  // implementation isn't constructible.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
}

// jsdom 27 declares HTMLDialogElement but implements neither showModal nor
// close, so Astryx's Dialog throws on open. These stubs mirror the real
// behaviour closely enough for queries that depend on the `open` attribute.
if (typeof HTMLDialogElement !== "undefined") {
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.removeAttribute("open");
  });
}
