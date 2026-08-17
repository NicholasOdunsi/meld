export type ThumbnailSize = { width: number; height: number };

export type CaptureOptions = { signal?: AbortSignal; timeoutMs?: number };

const DEFAULT_TIMEOUT_MS = 8000;

// The canvas-overlay picker chrome (drag handles, resize affordances) is
// baked into the same preview doc the canvas frame renders -- it's not
// something `buildFramePreviewDoc` can omit without changing the canvas's
// own rendering. Stripping it here, on the capture side, keeps the shared
// doc untouched: this is the one place a chat thumbnail and the live canvas
// frame diverge.
const PICKER_SELECTOR = "#meld-screen-picker";

// Races `work` against a timeout and an (optional) already-or-later abort,
// rejecting with `reason` on whichever fires first. `work` itself is
// responsible for wiring `signal` into whatever it awaits so a lost race
// doesn't leave that work running unobserved.
function raceAgainstTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const controller = new AbortController();
    const forwardAbort = () => {
      controller.abort();
      reject(new Error("screen thumbnail capture aborted"));
    };

    if (signal?.aborted) {
      forwardAbort();
      return;
    }
    signal?.addEventListener("abort", forwardAbort, { once: true });

    const timer = setTimeout(() => {
      controller.abort();
      signal?.removeEventListener("abort", forwardAbort);
      reject(new Error("screen thumbnail capture timed out"));
    }, timeoutMs);

    work(controller.signal).then(
      (value) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", forwardAbort);
        resolve(value);
      },
      (reason) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", forwardAbort);
        reject(reason);
      },
    );
  });
}

// Mounts `doc` in a hidden, script-inert, same-origin iframe and resolves
// once it has laid out. Off-screen positioning (not `display:none`) gives
// the iframe real layout dimensions -- a display:none frame never fires
// `load` reliably across browsers and its content never gets a real box to
// serialize.
function mountIframe(doc: string, size: ThumbnailSize): HTMLIFrameElement {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-same-origin");
  iframe.style.position = "fixed";
  iframe.style.left = "-99999px";
  iframe.style.top = "0";
  iframe.style.border = "0";
  iframe.style.visibility = "hidden";
  iframe.style.width = `${size.width}px`;
  iframe.style.height = `${size.height}px`;
  iframe.srcdoc = doc;
  document.body.appendChild(iframe);
  return iframe;
}

function waitForLoad(
  iframe: HTMLIFrameElement,
  signal: AbortSignal,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("screen thumbnail capture aborted"));
      return;
    }
    const onLoad = () => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    };
    const onAbort = () => {
      iframe.removeEventListener("load", onLoad);
      reject(new Error("screen thumbnail capture aborted"));
    };
    iframe.addEventListener("load", onLoad, { once: true });
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

// How coarse a grid to sample when checking for a blank frame. 8x8 (via
// strides across the full canvas, corners and edges included) is cheap and
// wide enough to catch a foreignObject that rasterized to nothing without
// false-positiving on legitimately sparse-but-real screens: it only rejects
// when *every* sampled pixel is uniform.
const BLANK_CHECK_GRID = 8;
const NEAR_WHITE_CHANNEL_MIN = 250;

// Some browsers rasterize an unsupported/broken `foreignObject` to an
// all-blank-but-untainted canvas -- `toDataURL` happily succeeds and we'd
// cache a solid-color (usually white) image forever, reintroducing the exact
// white-card bug this capture pipeline exists to remove. Sample a coarse
// grid spanning the *entire* frame and reject only when every sampled pixel
// is uniform: either fully transparent, or an identical near-white color.
// Deliberately conservative (whole-sample-set uniformity, not "mostly
// blank") so real minimal screens (e.g. a plain white card with one line of
// text) are never mistaken for a blank capture -- their text pixels break
// uniformity.
function isBlankCanvas(
  ctx: CanvasRenderingContext2D,
  size: ThumbnailSize,
): boolean {
  const strideX = Math.max(1, Math.floor(size.width / BLANK_CHECK_GRID));
  const strideY = Math.max(1, Math.floor(size.height / BLANK_CHECK_GRID));

  let firstColor: [number, number, number, number] | null = null;

  for (let y = 0; y < size.height; y += strideY) {
    for (let x = 0; x < size.width; x += strideX) {
      const { data } = ctx.getImageData(x, y, 1, 1);
      const pixel: [number, number, number, number] = [
        data[0] ?? 0,
        data[1] ?? 0,
        data[2] ?? 0,
        data[3] ?? 0,
      ];

      if (firstColor === null) {
        firstColor = pixel;
        continue;
      }

      if (
        pixel[0] !== firstColor[0] ||
        pixel[1] !== firstColor[1] ||
        pixel[2] !== firstColor[2] ||
        pixel[3] !== firstColor[3]
      ) {
        return false;
      }
    }
  }

  if (firstColor === null) return false;
  const [r, g, b, a] = firstColor;

  if (a === 0) return true;
  return (
    r >= NEAR_WHITE_CHANNEL_MIN &&
    g >= NEAR_WHITE_CHANNEL_MIN &&
    b >= NEAR_WHITE_CHANNEL_MIN
  );
}

function loadSvgImage(
  svg: string,
  signal: AbortSignal,
): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("screen thumbnail capture aborted"));
      return;
    }
    const image = new Image();
    const onAbort = () => reject(new Error("screen thumbnail capture aborted"));
    image.onload = () => {
      signal.removeEventListener("abort", onAbort);
      resolve(image);
    };
    image.onerror = () => {
      signal.removeEventListener("abort", onAbort);
      reject(new Error("screen thumbnail image failed to load"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

// Renders `doc` in a hidden, script-inert, same-origin iframe and returns a
// PNG data URL of the rendered device frame. Rejects on abort, timeout, or
// any rasterization failure (tainted canvas, image load error).
//
// Pipeline (proven in a real browser by the 2026-08-17 spike -- untainted,
// CSS vars resolved): sandboxed iframe -> XMLSerializer -> SVG
// `foreignObject` -> `Image` -> `<canvas>` -> PNG data URL. jsdom cannot
// rasterize, so this file's tests assert the DOM/timing seams only; see the
// task report for how real rasterization is covered.
export async function captureScreenThumbnail(
  doc: string,
  size: ThumbnailSize,
  options?: CaptureOptions,
): Promise<string> {
  if (options?.signal?.aborted) {
    throw new Error("screen thumbnail capture aborted");
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const iframe = mountIframe(doc, size);

  try {
    return await raceAgainstTimeout(
      async (raceSignal) => {
        await waitForLoad(iframe, raceSignal);

        const contentDocument = iframe.contentDocument;
        if (!contentDocument) {
          throw new Error("screen thumbnail capture found no content document");
        }
        contentDocument.querySelector(PICKER_SELECTOR)?.remove();

        const xml = new XMLSerializer().serializeToString(
          contentDocument.documentElement,
        );
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}"><foreignObject width="100%" height="100%">${xml}</foreignObject></svg>`;

        const image = await loadSvgImage(svg, raceSignal);

        const canvas = document.createElement("canvas");
        canvas.width = size.width;
        canvas.height = size.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error("screen thumbnail capture could not get a 2d context");
        }
        ctx.drawImage(image, 0, 0, size.width, size.height);

        let blank: boolean;
        try {
          blank = isBlankCanvas(ctx, size);
        } catch (thrown) {
          // `getImageData` throws on a tainted canvas (cross-origin data
          // baked into the doc) -- same reject behavior as the existing
          // `toDataURL` taint guard below.
          throw new Error("screen thumbnail canvas is tainted", {
            cause: thrown,
          });
        }
        if (blank) {
          // Some browsers rasterize an unsupported/broken `foreignObject`
          // to an all-blank canvas without tainting it -- `toDataURL` would
          // happily succeed here and we'd cache a solid white image
          // forever. Reject instead so the hook degrades to the View
          // button rather than caching a blank thumbnail.
          throw new Error("screen thumbnail capture rasterized a blank frame");
        }

        try {
          return canvas.toDataURL("image/png");
        } catch (thrown) {
          throw new Error("screen thumbnail canvas is tainted", {
            cause: thrown,
          });
        }
      },
      timeoutMs,
      options?.signal,
    );
  } finally {
    iframe.remove();
  }
}
