// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureScreenThumbnail: vi.fn(),
}));

vi.mock("./capture-screen-thumbnail", () => ({
  captureScreenThumbnail: mocks.captureScreenThumbnail,
}));

import { useScreenThumbnail } from "./use-screen-thumbnail";

const SIZE = { width: 320, height: 640 };

type ObserverEntry = { isIntersecting: boolean };
type ObserverCallback = (entries: ObserverEntry[]) => void;

// A controllable stand-in for the browser's IntersectionObserver: records
// every instance so a test can grab the one created for its render and fire
// its callback manually, rather than relying on jsdom to ever actually
// compute intersection (it doesn't).
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  callback: ObserverCallback;
  options: unknown;
  observed: Element[] = [];
  disconnected = false;

  constructor(callback: ObserverCallback, options?: unknown) {
    this.callback = callback;
    this.options = options;
    FakeIntersectionObserver.instances.push(this);
  }

  observe(element: Element) {
    this.observed.push(element);
  }

  unobserve() {}

  disconnect() {
    this.disconnected = true;
  }

  intersect() {
    this.callback([{ isIntersecting: true }]);
  }
}

// jsdom does not implement IntersectionObserver at all, so
// `globalThis.IntersectionObserver` is undefined before any test stubs it --
// this is the real baseline the hook's own SSR/no-polyfill guard has to
// handle, not a test artifact.
const originalIntersectionObserver = globalThis.IntersectionObserver;

function stubIntersectionObserver() {
  globalThis.IntersectionObserver =
    FakeIntersectionObserver as unknown as typeof IntersectionObserver;
}

function makeElement(): Element {
  return document.createElement("div");
}

beforeEach(() => {
  vi.clearAllMocks();
  FakeIntersectionObserver.instances = [];
  stubIntersectionObserver();
});

afterEach(() => {
  globalThis.IntersectionObserver = originalIntersectionObserver;
});

describe("useScreenThumbnail", () => {
  it("stays idle and never captures when doc is null", () => {
    const hook = renderHook(() => useScreenThumbnail(null, SIZE));

    expect(hook.result.current.state).toEqual({ status: "idle" });

    act(() => {
      hook.result.current.containerRef(makeElement());
    });
    // No observer should even be created when there's no doc to capture.
    expect(FakeIntersectionObserver.instances).toHaveLength(0);
    expect(mocks.captureScreenThumbnail).not.toHaveBeenCalled();
    expect(hook.result.current.state).toEqual({ status: "idle" });
  });

  it("not visible -> idle; observer firing -> capturing -> ready; capture called once", async () => {
    const doc = "<html>not-visible-doc</html>";
    mocks.captureScreenThumbnail.mockResolvedValue("data:image/png;base64,BBB");

    const hook = renderHook(() => useScreenThumbnail(doc, SIZE));
    act(() => {
      hook.result.current.containerRef(makeElement());
    });

    expect(hook.result.current.state).toEqual({ status: "idle" });
    expect(mocks.captureScreenThumbnail).not.toHaveBeenCalled();

    const observer = FakeIntersectionObserver.instances[0];
    expect(observer).toBeDefined();

    act(() => observer.intersect());
    expect(hook.result.current.state).toEqual({ status: "capturing" });

    await waitFor(() => {
      expect(hook.result.current.state).toEqual({
        status: "ready",
        src: "data:image/png;base64,BBB",
      });
    });

    expect(mocks.captureScreenThumbnail).toHaveBeenCalledTimes(1);
    expect(mocks.captureScreenThumbnail).toHaveBeenCalledWith(
      doc,
      SIZE,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    // One-shot: the observer disconnects once capture starts.
    expect(observer.disconnected).toBe(true);
  });

  it("transitions to error when capture rejects", async () => {
    const doc = "<html>error-doc</html>";
    mocks.captureScreenThumbnail.mockRejectedValue(new Error("capture boom"));

    const hook = renderHook(() => useScreenThumbnail(doc, SIZE));
    act(() => {
      hook.result.current.containerRef(makeElement());
    });
    act(() => FakeIntersectionObserver.instances[0].intersect());

    await waitFor(() => {
      expect(hook.result.current.state).toEqual({ status: "error" });
    });
  });

  it("caches by doc content: a cached doc is ready immediately, and a second hook with the same doc reuses it without capturing again", async () => {
    const doc = "<html>shared-cache-doc</html>";
    mocks.captureScreenThumbnail.mockResolvedValue("data:image/png;base64,SHARED");

    const first = renderHook(() => useScreenThumbnail(doc, SIZE));
    act(() => {
      first.result.current.containerRef(makeElement());
    });
    act(() => FakeIntersectionObserver.instances[0].intersect());

    await waitFor(() => {
      expect(first.result.current.state).toEqual({
        status: "ready",
        src: "data:image/png;base64,SHARED",
      });
    });
    expect(mocks.captureScreenThumbnail).toHaveBeenCalledTimes(1);

    // A second hook instance for the same doc content: ready immediately
    // from the module-level cache, no intersection wait, no new capture.
    const second = renderHook(() => useScreenThumbnail(doc, SIZE));
    expect(second.result.current.state).toEqual({
      status: "ready",
      src: "data:image/png;base64,SHARED",
    });
    expect(FakeIntersectionObserver.instances).toHaveLength(1); // no new observer created
    expect(mocks.captureScreenThumbnail).toHaveBeenCalledTimes(1);

    // Attaching a container and even firing intersection on the cached
    // instance must not trigger another capture.
    act(() => {
      second.result.current.containerRef(makeElement());
    });
    if (FakeIntersectionObserver.instances[1]) {
      act(() => FakeIntersectionObserver.instances[1].intersect());
    }
    expect(mocks.captureScreenThumbnail).toHaveBeenCalledTimes(1);
  });

  it(
    "evicts the oldest cache entry once the bounded cache exceeds its capacity",
    async () => {
      // Use the no-IntersectionObserver ("capture immediately on mount")
      // path so each of the many docs below captures synchronously on
      // render rather than needing a manual intersect() per instance.
      globalThis.IntersectionObserver = originalIntersectionObserver; // undefined
      mocks.captureScreenThumbnail.mockImplementation((doc: unknown) =>
        Promise.resolve(`data:image/png;base64,${String(doc)}`),
      );

      // The cache module is shared across this whole test file, so other
      // tests may have already cached a handful of entries; a batch well
      // past MAX_CACHE_ENTRIES (64) guarantees this batch's own oldest
      // entry is evicted regardless of that residue -- see the reasoning
      // in the fix-wave report.
      const BATCH_SIZE = 72;
      const docs = Array.from(
        { length: BATCH_SIZE },
        (_, i) => `<html>evict-doc-${i}</html>`,
      );

      for (const doc of docs) {
        const hook = renderHook(() => useScreenThumbnail(doc, SIZE));
        await waitFor(() => {
          expect(hook.result.current.state.status).toBe("ready");
        });
        hook.unmount();
      }

      const callsAfterFilling = mocks.captureScreenThumbnail.mock.calls.length;

      // The very first doc capped out of the cache: asking for it again
      // must re-capture rather than serve a stale (evicted) cache hit.
      const reCaptured = renderHook(() => useScreenThumbnail(docs[0], SIZE));
      await waitFor(() => {
        expect(reCaptured.result.current.state).toEqual({
          status: "ready",
          src: `data:image/png;base64,${docs[0]}`,
        });
      });
      expect(mocks.captureScreenThumbnail.mock.calls.length).toBe(
        callsAfterFilling + 1,
      );
    },
    20_000,
  );

  it("aborts the in-flight capture on unmount", async () => {
    const doc = "<html>unmount-doc</html>";
    let capturedSignal: AbortSignal | undefined;
    mocks.captureScreenThumbnail.mockImplementation(
      (_doc: string, _size: unknown, options?: { signal?: AbortSignal }) => {
        capturedSignal = options?.signal;
        return new Promise(() => {
          // never resolves -- we only care about abort behavior
        });
      },
    );

    const hook = renderHook(() => useScreenThumbnail(doc, SIZE));
    act(() => {
      hook.result.current.containerRef(makeElement());
    });
    act(() => FakeIntersectionObserver.instances[0].intersect());

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal?.aborted).toBe(false);

    hook.unmount();

    expect(capturedSignal?.aborted).toBe(true);
  });

  it("aborts the in-flight capture when doc changes", async () => {
    const docA = "<html>doc-a</html>";
    const docB = "<html>doc-b</html>";
    let capturedSignal: AbortSignal | undefined;
    mocks.captureScreenThumbnail.mockImplementation(
      (_doc: string, _size: unknown, options?: { signal?: AbortSignal }) => {
        capturedSignal = options?.signal;
        return new Promise(() => {});
      },
    );

    const hook = renderHook(({ doc }) => useScreenThumbnail(doc, SIZE), {
      initialProps: { doc: docA },
    });
    act(() => {
      hook.result.current.containerRef(makeElement());
    });
    act(() => FakeIntersectionObserver.instances[0].intersect());

    expect(capturedSignal?.aborted).toBe(false);

    hook.rerender({ doc: docB });

    expect(capturedSignal?.aborted).toBe(true);
  });

  it("captures immediately on mount (still gated by doc) when IntersectionObserver is unavailable", async () => {
    globalThis.IntersectionObserver = originalIntersectionObserver; // undefined
    expect(typeof IntersectionObserver).toBe("undefined");

    const doc = "<html>no-observer-doc</html>";
    mocks.captureScreenThumbnail.mockResolvedValue("data:image/png;base64,CCC");

    const hook = renderHook(() => useScreenThumbnail(doc, SIZE));

    await waitFor(() => {
      expect(hook.result.current.state).toEqual({
        status: "ready",
        src: "data:image/png;base64,CCC",
      });
    });
    expect(mocks.captureScreenThumbnail).toHaveBeenCalledTimes(1);
  });

  it("stays idle and never captures without IntersectionObserver when doc is null", () => {
    globalThis.IntersectionObserver = originalIntersectionObserver; // undefined

    const hook = renderHook(() => useScreenThumbnail(null, SIZE));

    expect(hook.result.current.state).toEqual({ status: "idle" });
    expect(mocks.captureScreenThumbnail).not.toHaveBeenCalled();
  });
});
