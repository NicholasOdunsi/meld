"use client";

import { VStack } from "@astryxdesign/core/VStack";
import { useRef, useState } from "react";
import type { PrototypeScreenSummary } from "@/features/design/prototype-reader";
import { usePrototypeFrame } from "@/features/design/use-prototype-frame";
import { PrototypeEmptyState } from "@/features/design/components/prototype-empty-state";
import { PrototypeScreenPill } from "@/features/design/components/prototype-screen-pill";
import {
  MOBILE_VIEWPORT_WIDTH_PX,
  PrototypeViewportToggle,
  type PrototypeViewport,
} from "@/features/design/components/prototype-viewport-toggle";

export type PrototypeViewerProps = {
  html: string | null;
  screenCount: number;
  screens: PrototypeScreenSummary[];
  hasUserFlow?: boolean;
  hasPrd?: boolean;
  onStart?: (instruction: string) => void;
  onFocusComposer?: () => void;
  /**
   * Set between an `onStart` click and either the generated screen
   * materialising (this whole empty state unmounts) or a failure toast --
   * see `RoomPlane`'s `startFromEmptyPrototype`. Without it, generation is
   * queued but not built, `router.refresh()` is a no-op, and the starting
   * points look clickable for the 30-60s generation actually takes.
   */
  isStarting?: boolean;
};

export function PrototypeViewer({
  // Defensive defaults: `html` and `screens` are required on the type, but
  // a caller a seam away (a null surface widened to `{}` before this
  // component ever sees it -- see `pane-content.tsx`'s `surfaceProps`) can
  // still hand this component no props at all. Without these, `screens[0]`
  // on `undefined` throws, and an `undefined` `html` would fail the
  // `=== null` check below and fall through to a broken main render
  // (a frame with no document, wrongly not read as "nothing built yet").
  html = null,
  screenCount = 0,
  screens = [],
  hasUserFlow,
  hasPrd,
  onStart,
  onFocusComposer,
  isStarting,
}: PrototypeViewerProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [selectedId, setSelectedId] = useState<string | undefined>(screens[0]?.id);
  const [viewport, setViewport] = useState<PrototypeViewport>("desktop");
  const { navigate, handleLoad } = usePrototypeFrame({
    frameRef,
    // A `meld:screen-changed` naming a screen that is not in `screens` must
    // be ignored, keeping the current label, rather than jumping the pill to
    // whatever `screens[0]` happens to be -- not reachable today (the
    // prototype only ever names screens it was built with), but a stated
    // contract in the design spec's error table.
    onScreenChanged: (screenId) => {
      if (screens.some((screen) => screen.id === screenId)) {
        setSelectedId(screenId);
      }
    },
  });

  // A screen can be deleted out from under the pane while it is being
  // viewed (an agent edit, another tab) -- fall back rather than pointing
  // the pill at a screen that no longer exists.
  const effectiveSelectedId = screens.some((screen) => screen.id === selectedId)
    ? selectedId
    : screens[0]?.id;

  if (html === null) {
    return (
      <VStack width="100%" height="100%" padding={6} hAlign="center" vAlign="center">
        <PrototypeEmptyState
          hasUserFlow={Boolean(hasUserFlow)}
          hasPrd={Boolean(hasPrd)}
          onStart={onStart ?? (() => {})}
          onFocusComposer={onFocusComposer ?? (() => {})}
          isStarting={Boolean(isStarting)}
        />
      </VStack>
    );
  }

  return (
    <VStack
      gap={0}
      style={{ position: "relative", width: "100%", height: "100%" }}
    >
      <VStack
        style={{
          position: "absolute",
          top: "var(--spacing-3)",
          left: "var(--spacing-3)",
          zIndex: 1,
        }}
      >
        <PrototypeScreenPill
          screens={screens}
          selectedId={effectiveSelectedId ?? ""}
          onSelect={(screenId) => {
            setSelectedId(screenId);
            navigate(screenId);
          }}
        />
      </VStack>
      <VStack
        style={{
          position: "absolute",
          top: "var(--spacing-3)",
          right: "var(--spacing-3)",
          zIndex: 1,
        }}
      >
        <PrototypeViewportToggle value={viewport} onChange={setViewport} />
      </VStack>
      <div
        data-testid="prototype-frame-wrapper"
        style={{
          width: viewport === "mobile" ? `${MOBILE_VIEWPORT_WIDTH_PX}px` : "100%",
          height: "100%",
          marginInline: "auto",
        }}
      >
        <iframe
          ref={frameRef}
          title={`Prototype preview (${screenCount} screen${screenCount === 1 ? "" : "s"})`}
          onLoad={handleLoad}
          sandbox="allow-scripts"
          srcDoc={html}
          style={{ width: "100%", height: "100%", border: "0" }}
        />
      </div>
    </VStack>
  );
}
