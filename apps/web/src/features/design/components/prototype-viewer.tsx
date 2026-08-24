"use client";

import { VStack } from "@astryxdesign/core/VStack";
import { useCallback, useRef, useState } from "react";
import { flushSync } from "react-dom";
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
};

export function PrototypeViewer({
  html,
  screens,
  hasUserFlow,
  hasPrd,
  onStart,
  onFocusComposer,
}: PrototypeViewerProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [selectedId, setSelectedId] = useState<string | undefined>(screens[0]?.id);
  const [viewport, setViewport] = useState<PrototypeViewport>("desktop");
  // Navigation originating inside the sandboxed prototype arrives through a
  // plain `window` message listener, outside any React-managed event -- so
  // the resulting state update is not automatically batched-and-flushed the
  // way a click handled by React is. `flushSync` makes the pill's label
  // update in the same tick the prototype reports the change, rather than on
  // an unrelated later render.
  const onScreenChanged = useCallback((screenId: string) => {
    flushSync(() => setSelectedId(screenId));
  }, []);
  const { navigate, handleLoad } = usePrototypeFrame({
    frameRef,
    onScreenChanged,
  });

  // A screen can be deleted out from under the pane while it is being
  // viewed (an agent edit, another tab) -- fall back rather than pointing
  // the pill at a screen that no longer exists.
  const effectiveSelectedId = screens.some((screen) => screen.id === selectedId)
    ? selectedId
    : screens[0]?.id;

  if (html === null) {
    return (
      <PrototypeEmptyState
        hasUserFlow={Boolean(hasUserFlow)}
        hasPrd={Boolean(hasPrd)}
        onStart={onStart ?? (() => {})}
        onFocusComposer={onFocusComposer ?? (() => {})}
      />
    );
  }

  return (
    <VStack
      gap={0}
      style={{ position: "relative", width: "100%", height: "100%" }}
    >
      <VStack style={{ position: "absolute", top: 0, left: 0, zIndex: 1 }}>
        <PrototypeScreenPill
          screens={screens}
          selectedId={effectiveSelectedId ?? ""}
          onSelect={(screenId) => {
            setSelectedId(screenId);
            navigate(screenId);
          }}
        />
      </VStack>
      <VStack style={{ position: "absolute", top: 0, right: 0, zIndex: 1 }}>
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
          onLoad={handleLoad}
          sandbox="allow-scripts"
          srcDoc={html}
          style={{ width: "100%", height: "100%", border: "0" }}
        />
      </div>
    </VStack>
  );
}
