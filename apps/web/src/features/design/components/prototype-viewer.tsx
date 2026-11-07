"use client";

import { useEffect, useRef, useState } from "react";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { VStack } from "@astryxdesign/core/VStack";
import {
  FORM_FACTOR_SIZES,
  isFormFactor,
  type FormFactor,
} from "@meld/prototype";

export type PrototypeViewerProps = {
  html: string | null;
  screenCount: number;
};

// The prototype document posts { type: "meld:screen", formFactor } every time
// it shows a screen. Phone and tablet screens get a device-sized frame so their
// own media queries see a phone/tablet viewport; desktop screens fill the panel.
function useShownFormFactor(
  frameRef: React.RefObject<HTMLIFrameElement | null>,
  html: string | null,
): FormFactor {
  // Tagged with the document it came from, so a rebuilt prototype starts at
  // full width until its own first screen reports in.
  const [shown, setShown] = useState<{
    html: string | null;
    formFactor: FormFactor;
  }>({ html, formFactor: "desktop" });
  const htmlRef = useRef(html);
  useEffect(() => {
    htmlRef.current = html;
  }, [html]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const frameWindow = frameRef.current?.contentWindow;
      if (!frameWindow || event.source !== frameWindow) return;
      const data: unknown = event.data;
      if (
        typeof data !== "object" ||
        data === null ||
        (data as { type?: unknown }).type !== "meld:screen"
      ) {
        return;
      }
      const next = (data as { formFactor?: unknown }).formFactor;
      setShown({
        html: htmlRef.current,
        formFactor: isFormFactor(next) ? next : "desktop",
      });
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [frameRef]);

  return shown.html === html ? shown.formFactor : "desktop";
}

export function PrototypeViewer({ html, screenCount }: PrototypeViewerProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const formFactor = useShownFormFactor(frameRef, html);

  if (html === null) {
    return (
      <VStack
        width="100%"
        height="100%"
        padding={6}
        hAlign="center"
        vAlign="center"
      >
        <EmptyState
          title="No screens built yet"
          description="Generate a screen to see the prototype."
        />
      </VStack>
    );
  }

  const device = formFactor === "desktop" ? null : FORM_FACTOR_SIZES[formFactor];
  const panelBackground = device
    ? "var(--color-background-muted)"
    : "var(--color-background-body)";
  const panelStyle = { backgroundColor: panelBackground, overflow: "auto" as const };

  return (
    <VStack
      gap={0}
      width="100%"
      height="100%"
      hAlign="center"
      vAlign="center"
      padding={device ? 6 : 0}
      style={panelStyle}
    >
      <iframe
        ref={frameRef}
        title={`Prototype preview (${screenCount} screen${screenCount === 1 ? "" : "s"})`}
        sandbox="allow-scripts"
        srcDoc={html}
        style={
          device
            ? {
                width: `${device.w}px`,
                maxWidth: "100%",
                height: `${device.h}px`,
                maxHeight: "100%",
                flexShrink: 0,
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-page)",
                boxShadow: "var(--shadow-high)",
                backgroundColor: "var(--color-background-body)",
              }
            : { width: "100%", height: "100%", border: "0" }
        }
      />
    </VStack>
  );
}
