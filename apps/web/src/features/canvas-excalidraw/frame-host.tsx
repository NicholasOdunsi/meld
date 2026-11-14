"use client";

import { useMemo, useSyncExternalStore } from "react";
import { Text } from "@astryxdesign/core/Text";
import { buildBoardFrameDocument, BOARD_FRAME_SANDBOX } from "./frame-document";
import type { ScreenStore } from "./screen-store";

export function FrameHost({ screenId, store }: {
  screenId: string;
  store: ScreenStore;
}) {
  const screen = useSyncExternalStore(store.subscribe, () => store.get(screenId), () => undefined);
  const document = useMemo(() => (screen ? buildBoardFrameDocument(screen.html) : ""), [screen]);
  if (!screen) return <Text>Loading screen…</Text>;
  return (
    <iframe
      title={`Screen ${screenId}`}
      data-orion-frame={screenId}
      sandbox={BOARD_FRAME_SANDBOX}
      srcDoc={document}
      style={{ width: "100%", height: "100%", border: 0, pointerEvents: "none", background: "var(--color-background-surface)" }}
    />
  );
}
