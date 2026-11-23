"use client";

import { useMemo, useSyncExternalStore } from "react";
import { Overlay } from "@astryxdesign/core/Overlay";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { buildBoardFrameDocument, BOARD_FRAME_SANDBOX, FRAME_SANDBOX } from "./frame-document";
import type { LiveController } from "./live/live-controller";
import { ASLEEP, liveViewFor } from "./live/live-state";
import { StoppedOverlay } from "./live/stopped-overlay";
import type { ScreenStore } from "./screen-store";

const noSubscribe = () => () => {};
const frameStyle = { width: "100%", height: "100%", border: 0, background: "var(--color-background-surface)" } as const;

export function FrameHost({ screenId, store, live, onShowCode, onLivePointer }: {
  screenId: string;
  store: ScreenStore;
  live?: LiveController;
  onShowCode?: () => void;
  // Told when the pointer enters or leaves the live iframe (the board trusts its pinch reports only then).
  onLivePointer?: (frame: HTMLIFrameElement, over: boolean) => void;
}) {
  const screen = useSyncExternalStore(store.subscribe, () => store.get(screenId), () => undefined);
  const liveState = useSyncExternalStore(live?.subscribe ?? noSubscribe, () => live?.getState() ?? ASLEEP, () => ASLEEP);
  const view = liveViewFor(liveState, screenId);
  const document = useMemo(() => (screen ? buildBoardFrameDocument(screen.html) : ""), [screen]);

  const attempt = view.mode === "live" ? view.attempt : null;
  const attachFrame = useMemo(() => {
    return (frame: HTMLIFrameElement | null) => {
      if (!live || attempt === null) return;
      const current = live.getState();
      // A stale ref cleanup must not forget a newer attempt or another screen.
      if (current.phase === "asleep" || current.screenId !== screenId || current.attempt !== attempt) return;
      live.attachFrame(frame?.contentWindow ?? null);
    };
  }, [live, screenId, attempt]);

  if (live && view.mode === "live") {
    return (
      <iframe
        key={view.attempt}
        title={`Live screen ${screenId}`}
        data-orion-live={screenId}
        sandbox={FRAME_SANDBOX}
        srcDoc={view.document}
        ref={attachFrame}
        onPointerEnter={(event) => onLivePointer?.(event.currentTarget, true)}
        onPointerLeave={(event) => onLivePointer?.(event.currentTarget, false)}
        style={{ ...frameStyle, pointerEvents: "auto", outline: "var(--spacing-0-5) solid var(--color-accent)" }}
      />
    );
  }
  if (live && view.mode === "stopped") {
    return <StoppedOverlay reason={view.reason} detail={view.detail} onReload={() => live.reload()} onShowCode={onShowCode} />;
  }
  const thumbnail = screen ? (
    <iframe
      title={`Screen ${screenId}`}
      data-orion-frame={screenId}
      sandbox={BOARD_FRAME_SANDBOX}
      srcDoc={document}
      style={{ ...frameStyle, pointerEvents: "none" }}
    />
  ) : <Text>Loading screen…</Text>;
  if (view.mode === "waking") {
    return (
      <Overlay content={<Spinner label="Opening screen…" />} align="center" style={{ width: "100%", height: "100%" }}>
        {thumbnail}
      </Overlay>
    );
  }
  return thumbnail;
}
