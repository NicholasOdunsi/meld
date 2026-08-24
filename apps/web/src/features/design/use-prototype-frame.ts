"use client";

import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";

/**
 * The channel between the app's chrome and the sandboxed prototype.
 *
 * The picker used to live inside the document, so no channel was needed. Now
 * the pill lives outside it, and this carries intent in and truth back out.
 * Both directions matter: clicking a button inside the prototype navigates
 * too, and the pill's label has to follow or it starts lying.
 */
export function usePrototypeFrame({
  frameRef,
  onScreenChanged,
}: {
  frameRef: RefObject<HTMLIFrameElement | null>;
  onScreenChanged: (screenId: string) => void;
}): { navigate: (screenId: string) => void; handleLoad: () => void } {
  const loadedRef = useRef(false);
  const pendingRef = useRef<string | null>(null);
  // A ref, so the listener below can stay mounted for the component's life
  // rather than tearing down and re-subscribing on every render.
  const onScreenChangedRef = useRef(onScreenChanged);
  useEffect(() => {
    onScreenChangedRef.current = onScreenChanged;
  }, [onScreenChanged]);

  const post = useCallback(
    (screenId: string) => {
      frameRef.current?.contentWindow?.postMessage(
        { type: "meld:navigate", screenId },
        // The frame's origin is opaque (sandboxed without allow-same-origin),
        // so it cannot be named. The payload is a screen id, not a secret.
        "*",
      );
    },
    [frameRef],
  );

  const navigate = useCallback(
    (screenId: string) => {
      if (!loadedRef.current) {
        pendingRef.current = screenId;
        return;
      }
      post(screenId);
    },
    [post],
  );

  const handleLoad = useCallback(() => {
    loadedRef.current = true;
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) post(pending);
  }, [post]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as unknown;
      if (typeof data !== "object" || data === null) return;
      const message = data as { type?: unknown; screenId?: unknown };
      if (message.type !== "meld:screen-changed") return;
      if (typeof message.screenId !== "string") return;
      onScreenChangedRef.current(message.screenId);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [frameRef]);

  return { navigate, handleLoad };
}
