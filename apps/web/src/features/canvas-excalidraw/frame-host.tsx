"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { Text } from "@astryxdesign/core/Text";
import { parseFrameMessage } from "./frame-bridge";
import { buildFrameDocument, FRAME_SANDBOX } from "./frame-document";
import type { ScreenStore } from "./screen-store";

export function FrameHost({ screenId, store, onNavigate }: {
  screenId: string;
  store: ScreenStore;
  onNavigate: (screenKey: string) => void;
}) {
  const screen = useSyncExternalStore(store.subscribe, () => store.get(screenId), () => undefined);
  const ref = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const message = parseFrameMessage(event, ref.current?.contentWindow, (key) => store.get(key) !== undefined);
      if (message) onNavigate(message.screenKey);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [store, onNavigate]);

  const document = useMemo(() => (screen ? buildFrameDocument(screen.html) : ""), [screen]);
  if (!screen) return <Text>Loading screen…</Text>;
  return (
    <iframe
      ref={ref}
      title={`Screen ${screenId}`}
      data-orion-frame={screenId}
      sandbox={FRAME_SANDBOX}
      srcDoc={document}
      style={{ width: "100%", height: "100%", border: 0, background: "var(--color-background-surface)" }}
    />
  );
}
