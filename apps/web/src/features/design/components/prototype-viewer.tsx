"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { useRef, useState } from "react";
import type { PrototypeScreenSummary } from "@/features/design/prototype-reader";
import { usePrototypeFrame } from "@/features/design/use-prototype-frame";
import { PrototypeEmptyState } from "@/features/design/components/prototype-empty-state";
import { PrototypeScreenPill } from "@/features/design/components/prototype-screen-pill";
import {
  MOBILE_VIEWPORT_HEIGHT_PX,
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
  /**
   * How many design-system overrides `assemblePrototypeWithConformance`
   * silently corrected before this document was ever assembled -- a screen's
   * CSS is injected after the design system's stylesheet, so an override
   * could otherwise land in the render unnoticed. Absent or 0 says nothing:
   * a clean screen deserves no notice at all.
   */
  conformanceCorrections?: number;
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
  conformanceCorrections,
  onStart,
  onFocusComposer,
  isStarting,
}: PrototypeViewerProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [selectedId, setSelectedId] = useState<string | undefined>(screens[0]?.id);
  const [viewport, setViewport] = useState<PrototypeViewport>("desktop");
  // A dead button used to fail silently: the harness set an attribute on its
  // own document that nothing outside the sandbox could read, so a missing
  // link looked exactly like broken software. This names the button instead,
  // and clears the moment navigation actually succeeds.
  // `seq` is bumped on every unresolved message so the notice below remounts
  // (a fresh key) instead of reusing the same Banner instance. Banner's
  // dismiss state is internal to the component; without a remount, dismissing
  // the notice for one dead button would leave a later, different dead button
  // silently suppressed too. It rides in the state rather than a ref because
  // render may not read a ref.
  const [unresolved, setUnresolved] = useState<{
    action: string;
    label: string;
    seq: number;
  } | null>(null);
  const { navigate, handleLoad } = usePrototypeFrame({
    frameRef,
    // A `meld:screen-changed` naming a screen that is not in `screens` must
    // be ignored, keeping the current label, rather than jumping the pill to
    // whatever `screens[0]` happens to be -- not reachable today (the
    // prototype only ever names screens it was built with), but a stated
    // contract in the design spec's error table.
    onScreenChanged: (screenId) => {
      setUnresolved(null);
      if (screens.some((screen) => screen.id === screenId)) {
        setSelectedId(screenId);
      }
    },
    // Cmd/Ctrl+K pressed while the prototype has focus. Keyboard events go to
    // the focused document, so once someone clicks into the frame the host's
    // own listener stops seeing them -- the shortcut appears broken exactly
    // when they are looking at a screen and want to say something about it.
    // A sandboxed frame cannot be listened to from outside, so it forwards.
    onShortcut: (shortcut) => {
      if (shortcut === "composer") onFocusComposer?.();
    },
    // Replaces itself for a different dead button, rather than piling up --
    // there is only ever one thing to say at a time.
    onUnresolved: (info) => {
      setUnresolved((current) => ({ ...info, seq: (current?.seq ?? 0) + 1 }));
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
      {/* Both controls sit together on the right. The pill used to be top-left,
          where the plane's own toolbar floats -- so the toolbar covered the
          screen name, and worse, the toolbar has no fixed width (it sizes to
          its content and expands), which makes any left-side offset a guess
          that breaks whenever the toolbar changes. The right edge has nothing
          on it, and grouping the two reads as one set of chrome. */}
      <HStack
        gap={2}
        vAlign="center"
        style={{
          position: "absolute",
          top: "var(--spacing-3)",
          right: "var(--spacing-3)",
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
        <PrototypeViewportToggle value={viewport} onChange={setViewport} />
      </HStack>
      <div
        data-testid="prototype-frame-wrapper"
        style={{
          width: viewport === "mobile" ? `${MOBILE_VIEWPORT_WIDTH_PX}px` : "100%",
          // Capped at the pane: a 932px frame in a shorter pane would spill
          // out of it rather than preview anything useful.
          height:
            viewport === "mobile"
              ? `min(${MOBILE_VIEWPORT_HEIGHT_PX}px, 100%)`
              : "100%",
          // Phone corners, so the mobile preview reads as a device rather than
          // a narrow column. `overflow: hidden` is what actually clips the
          // iframe to them -- a radius alone leaves the frame's own square
          // corners poking out past it.
          borderRadius:
            viewport === "mobile" ? "var(--meld-radius-device)" : undefined,
          overflow: viewport === "mobile" ? "hidden" : undefined,
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
      {unresolved || (conformanceCorrections && conformanceCorrections > 0) ? (
        // Absolutely positioned over the frame, not sized into the flow
        // above it -- so it can never resize or remount the iframe (a
        // remount reloads the srcDoc and throws the prototype back to its
        // start screen), and it sits at the bottom, clear of the pill and
        // viewport toggle at the top-right.
        <div
          style={{
            position: "absolute",
            left: "var(--spacing-3)",
            right: "var(--spacing-3)",
            bottom: "var(--spacing-3)",
            zIndex: 1,
          }}
        >
          {unresolved ? (
            <Banner
              key={unresolved.seq}
              status="info"
              isDismissable
              title={
                unresolved.label
                  ? `"${unresolved.label}" isn't connected to a screen yet.`
                  : "That button isn't connected to a screen yet."
              }
            />
          ) : null}
          {conformanceCorrections && conformanceCorrections > 0 ? (
            <Banner
              status="info"
              isDismissable
              title={`${conformanceCorrections} design-system override${
                conformanceCorrections === 1 ? "" : "s"
              } corrected.`}
            />
          ) : null}
        </div>
      ) : null}
    </VStack>
  );
}
