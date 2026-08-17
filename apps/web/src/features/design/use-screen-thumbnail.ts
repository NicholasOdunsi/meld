"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  captureScreenThumbnail,
  type ThumbnailSize,
} from "./capture-screen-thumbnail";

export type ScreenThumbnailState =
  | { status: "idle" } // not yet visible / no doc
  | { status: "capturing" }
  | { status: "ready"; src: string }
  | { status: "error" };

// Module-level, in-memory, content-addressed cache -- intentionally *not*
// localStorage/sessionStorage/a DB: it exists only to dedupe re-captures of
// the same screen markup within a single page session (across remounts and
// across both chat and canvas mount sites), not to persist across reloads.
const cache = new Map<string, string>();

// FNV-1a over the full `doc` string. Fast and good-enough distribution for
// cache-keying -- not cryptographic, collisions are not a security concern
// here (worst case: a stale thumbnail briefly reused for a re-hashed doc).
function hashDoc(doc: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < doc.length; i += 1) {
    hash ^= doc.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

// Start the capture just before the element scrolls into view, not exactly
// on entry -- avoids a visible pop-in for the common case of scrolling
// through a chat feed of screen references.
const ROOT_MARGIN = "200px";

function resolveInitialState(doc: string | null): ScreenThumbnailState {
  if (doc === null) return { status: "idle" };
  const cached = cache.get(hashDoc(doc));
  return cached !== undefined
    ? { status: "ready", src: cached }
    : { status: "idle" };
}

// Lazily captures a PNG thumbnail of `doc` once the element behind
// `containerRef` scrolls near the viewport, with an in-memory
// content-addressed cache so identical screen markup is only ever
// rasterized once per page session.
//
// Two effects split ownership deliberately:
//  - the doc/size effect owns the AbortController and the capture's
//    lifecycle (cache lookup, invoking `captureScreenThumbnail`, aborting on
//    unmount or when `doc`/`size` change) and publishes a one-shot `capture`
//    function into `captureFnRef`;
//  - the node effect owns the `IntersectionObserver` (created/torn down
//    whenever the observed element changes) and, on first intersection,
//    calls whatever `captureFnRef` currently points at.
// Reading through the ref (rather than closing over `capture` in the node
// effect) means a node-identity change alone never tears down or restarts
// an in-flight capture, and a doc change alone never has to re-create the
// observer.
export function useScreenThumbnail(
  doc: string | null,
  size: ThumbnailSize,
): {
  state: ScreenThumbnailState;
  containerRef: (node: Element | null) => void;
} {
  const [node, setNode] = useState<Element | null>(null);
  const containerRef = useCallback((element: Element | null) => {
    setNode(element);
  }, []);

  const [state, setState] = useState<ScreenThumbnailState>(() =>
    resolveInitialState(doc),
  );

  // `doc`/`size` changing means the previous `state` no longer describes the
  // right thing (a different screen, or none). Resetting that during render
  // -- rather than via a synchronous setState at the top of the effect below
  // -- avoids an effect committing a stale frame first (see React's
  // "Adjusting state when a prop changes"; also flagged by
  // react-hooks/set-state-in-effect).
  const generation = `${doc ?? ""}::${size.width}x${size.height}`;
  const [renderedGeneration, setRenderedGeneration] = useState(generation);
  if (generation !== renderedGeneration) {
    setRenderedGeneration(generation);
    setState(resolveInitialState(doc));
  }

  const captureFnRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (doc === null) {
      captureFnRef.current = null;
      return;
    }

    const key = hashDoc(doc);
    const cached = cache.get(key);
    if (cached !== undefined) {
      captureFnRef.current = null;
      return;
    }

    let disposed = false;
    let started = false;
    const controller = new AbortController();

    const capture = () => {
      if (started || disposed) return;
      started = true;
      captureFnRef.current = null;
      setState({ status: "capturing" });
      captureScreenThumbnail(doc, size, { signal: controller.signal }).then(
        (src) => {
          if (disposed) return;
          cache.set(key, src);
          setState({ status: "ready", src });
        },
        () => {
          if (disposed) return;
          setState({ status: "error" });
        },
      );
    };

    captureFnRef.current = capture;

    // No observer support (SSR, or jsdom without the polyfill): there is no
    // way to know when the element is near the viewport, so treat it as
    // already visible.
    if (typeof IntersectionObserver === "undefined") {
      capture();
    }

    return () => {
      disposed = true;
      captureFnRef.current = null;
      controller.abort();
    };
    // Keyed on the primitive width/height, not `size` itself, so a
    // caller-provided object literal that's equal in value but a new
    // reference each render doesn't abort/restart an in-flight capture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, size.width, size.height]);

  useEffect(() => {
    if (!node || doc === null || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          // One-shot: this observer's only job was to trigger the capture.
          observer.disconnect();
          captureFnRef.current?.();
        }
      },
      { rootMargin: ROOT_MARGIN },
    );
    observer.observe(node);

    return () => observer.disconnect();
  }, [node, doc]);

  return { state, containerRef };
}
