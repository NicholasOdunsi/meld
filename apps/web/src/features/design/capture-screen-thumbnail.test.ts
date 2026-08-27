// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureScreenThumbnail } from "./capture-screen-thumbnail";

const DOC = "<html><body>hello</body></html>";
const SIZE = { width: 320, height: 640 };

// jsdom's own `<iframe srcdoc>` fires a real `load` asynchronously but never
// actually renders the srcdoc content into `contentDocument` -- there's
// nothing for `XMLSerializer` to serialize and no way to control *when* that
// load fires (racing our own fake-timer-driven timeout). So every test below
// swaps `document.createElement("iframe")` for a plain `div` element: it still
// supports `setAttribute`, `.srcdoc`, `addEventListener`/`dispatchEvent`, and
// `remove()`, so the capture util can't tell the difference, but the test
// drives `load` (and `contentDocument`) itself. `document.createElement` for
// every other tag (the rasterization `<canvas>`) passes through untouched.
let mountedIframe: HTMLIFrameElement | null = null;
const realCreateElement = document.createElement.bind(document);

beforeEach(() => {
  mountedIframe = null;
  vi.spyOn(document, "createElement").mockImplementation(((
    tagName: string,
  ) => {
    if (tagName !== "iframe") return realCreateElement(tagName);
    const node = realCreateElement("div") as unknown as HTMLIFrameElement;
    mountedIframe = node;
    return node;
  }) as typeof document.createElement);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function getMountedIframe(): HTMLIFrameElement {
  if (!mountedIframe) throw new Error("expected an iframe to be mounted");
  return mountedIframe;
}

// jsdom does not actually load `Image` resources (no network, no decode), so
// real rasterization can't be exercised here -- see the 2026-08-17 spike for
// that. This stub gives the test the same seam the browser gives the util:
// something it can drive `onload`/`onerror` on.
let lastStubImage: { onload: (() => void) | null; onerror: (() => void) | null; src: string } | null = null;

function stubImage() {
  lastStubImage = null;
  // A plain function that *returns* the stub object -- rather than a class
  // assigning to `this` -- so the constructed instance can be captured
  // without aliasing `this` to a local.
  vi.stubGlobal(
    "Image",
    function StubImage() {
      const image = { onload: null, onerror: null, src: "" };
      lastStubImage = image;
      return image;
    },
  );
}

// jsdom's `HTMLCanvasElement` has no real 2d context (the `canvas` npm
// package isn't a dependency here), so the happy-path tests stub the
// rasterization seam rather than exercising it. `getImageData` defaults to a
// single non-blank, non-white pixel so the blank-frame guard doesn't reject
// tests that aren't specifically about it; pass a `pixel` to simulate a
// blank/near-white rasterization instead.
function stubCanvasRasterization(
  pixel: [number, number, number, number] = [10, 20, 30, 255],
) {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data: Uint8ClampedArray.from(pixel) })),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
    "data:image/png;base64,stub",
  );
}

function stubContentDocument(iframe: HTMLIFrameElement) {
  const stub = {
    documentElement: document.createElement("html"),
  } as unknown as Document;
  Object.defineProperty(iframe, "contentDocument", {
    configurable: true,
    get: () => stub,
  });
}

async function flushMicrotasks(ticks = 5) {
  for (let i = 0; i < ticks; i++) {
    await Promise.resolve();
  }
}

describe("captureScreenThumbnail", () => {
  it("rejects immediately when the signal is already aborted, without mounting an iframe", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      captureScreenThumbnail(DOC, SIZE, { signal: controller.signal }),
    ).rejects.toThrow();

    expect(mountedIframe).toBeNull();
  });

  it("mounts a same-origin sandboxed iframe with the given srcdoc, and removes it from the DOM after resolving", async () => {
    stubImage();
    stubCanvasRasterization();

    const promise = captureScreenThumbnail(DOC, SIZE);
    const iframe = getMountedIframe();

    expect(iframe.getAttribute("sandbox")).toBe("allow-same-origin");
    expect(iframe.srcdoc).toBe(DOC);
    expect(document.body.contains(iframe)).toBe(true);

    stubContentDocument(iframe);
    iframe.dispatchEvent(new Event("load"));
    await flushMicrotasks();
    lastStubImage?.onload?.();

    await expect(promise).resolves.toBe("data:image/png;base64,stub");
    expect(document.body.contains(iframe)).toBe(false);
  });

  it("rejects a uniformly white/blank rasterized frame instead of resolving it", async () => {
    stubImage();
    stubCanvasRasterization([255, 255, 255, 255]);

    const promise = captureScreenThumbnail(DOC, SIZE);
    const iframe = getMountedIframe();
    stubContentDocument(iframe);
    iframe.dispatchEvent(new Event("load"));
    await flushMicrotasks();
    lastStubImage?.onload?.();

    await expect(promise).rejects.toThrow(/blank/);
    expect(document.body.contains(iframe)).toBe(false);
  });

  it("rejects a uniformly fully-transparent rasterized frame instead of resolving it", async () => {
    stubImage();
    stubCanvasRasterization([0, 0, 0, 0]);

    const promise = captureScreenThumbnail(DOC, SIZE);
    const iframe = getMountedIframe();
    stubContentDocument(iframe);
    iframe.dispatchEvent(new Event("load"));
    await flushMicrotasks();
    lastStubImage?.onload?.();

    await expect(promise).rejects.toThrow(/blank/);
    expect(document.body.contains(iframe)).toBe(false);
  });

  it("resolves a non-blank rasterized frame (varied sampled pixels)", async () => {
    stubImage();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
      getImageData: vi
        .fn()
        // First sampled pixel is near-white; a later one is not, so the
        // sample set is non-uniform and the frame must not be treated as
        // blank -- this is the real-content case the guard must not reject.
        .mockReturnValueOnce({
          data: Uint8ClampedArray.from([255, 255, 255, 255]),
        })
        .mockReturnValue({ data: Uint8ClampedArray.from([12, 34, 56, 255]) }),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/png;base64,stub",
    );

    const promise = captureScreenThumbnail(DOC, SIZE);
    const iframe = getMountedIframe();
    stubContentDocument(iframe);
    iframe.dispatchEvent(new Event("load"));
    await flushMicrotasks();
    lastStubImage?.onload?.();

    await expect(promise).resolves.toBe("data:image/png;base64,stub");
    expect(document.body.contains(iframe)).toBe(false);
  });

  it("rejects when getImageData throws (tainted canvas), same as the toDataURL taint guard", async () => {
    stubImage();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => {
        throw new DOMException("tainted", "SecurityError");
      }),
    } as unknown as CanvasRenderingContext2D);

    const promise = captureScreenThumbnail(DOC, SIZE);
    const iframe = getMountedIframe();
    stubContentDocument(iframe);
    iframe.dispatchEvent(new Event("load"));
    await flushMicrotasks();
    lastStubImage?.onload?.();

    await expect(promise).rejects.toThrow(/tainted/);
    expect(document.body.contains(iframe)).toBe(false);
  });

  it("removes the iframe from the DOM after rejecting (image failed to rasterize)", async () => {
    stubImage();

    const promise = captureScreenThumbnail(DOC, SIZE);
    const iframe = getMountedIframe();
    stubContentDocument(iframe);
    iframe.dispatchEvent(new Event("load"));
    await flushMicrotasks();
    lastStubImage?.onerror?.();

    await expect(promise).rejects.toThrow();
    expect(document.body.contains(iframe)).toBe(false);
  });

  it("rejects once timeoutMs elapses when the iframe never fires load", async () => {
    vi.useFakeTimers();

    const promise = captureScreenThumbnail(DOC, SIZE, { timeoutMs: 1000 });
    const iframe = getMountedIframe();
    const assertion = expect(promise).rejects.toThrow(/timed out/);

    await vi.advanceTimersByTimeAsync(1000);
    await assertion;

    expect(document.body.contains(iframe)).toBe(false);
  });
});
