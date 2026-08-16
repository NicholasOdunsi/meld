"use client";

import { EmptyState } from "@astryxdesign/core/EmptyState";
import { IconButton } from "@astryxdesign/core/IconButton";
import { StackItem } from "@astryxdesign/core/Stack";
import { VStack } from "@astryxdesign/core/VStack";
import { assembleValidatedPrototype } from "@meld/prototype";
import { track, useEditor } from "tldraw";
import { useMemo } from "react";
import type { CanvasScreen } from "@/features/design/canvas-screen-reader";
import { overlayRectForFrame } from "./screen-overlay-geometry";

export type ScreenFrameOverlayProps = {
  screens: CanvasScreen[];
  onPreview: (screenId: string) => void;
  tokenCss?: string;
};

export function buildFramePreviewDoc(
  screen: CanvasScreen,
  tokenCss: string,
): string | null {
  if (screen.state !== "built" || !screen.preview) return null;

  return assembleValidatedPrototype({
    screens: [
      {
        id: screen.id,
        name: screen.name,
        ...screen.preview,
        // `screen.preview` never carries a `layout` key -- this reader
        // builds it from just markup/styles/script/actions -- but its type
        // (DesignScreenPayload) allows one, and that slot means something
        // different there (the generator's wire-level reuse/create
        // directive) than it does here (the already-resolved shell). Setting
        // it explicitly after the spread is what puts the composer's actual
        // shell, `screen.layout`, in the right place.
        layout: screen.layout,
      },
    ],
    startScreenId: screen.id,
    tokenCss,
  });
}

export const ScreenFrameOverlay = track(function ScreenFrameOverlay({
  screens,
  onPreview,
  tokenCss = "",
}: ScreenFrameOverlayProps) {
  const editor = useEditor();
  const screensById = useMemo(
    () => new Map(screens.map((screen) => [screen.id, screen])),
    [screens],
  );
  const previewDocs = useMemo(
    () =>
      new Map(
        screens.map((screen) => {
          try {
            return [screen.id, buildFramePreviewDoc(screen, tokenCss)] as const;
          } catch {
            return [screen.id, null] as const;
          }
        }),
      ),
    [screens, tokenCss],
  );
  const viewportScreenBounds = editor.getViewportScreenBounds();
  const camera = editor.getCamera();

  return editor.getCurrentPageShapes().map((shape) => {
    if (shape.type !== "frame") return null;
    if (shape.meta.meldOrphan === true) return null;

    const meldScreenId = shape.meta.meldScreenId;
    if (typeof meldScreenId !== "string") return null;

    const screen = screensById.get(meldScreenId);
    const pageBounds = editor.getShapePageBounds(shape.id);
    if (!screen || !pageBounds) return null;

    const rect = overlayRectForFrame(
      pageBounds,
      viewportScreenBounds,
      camera,
    );
    const previewDoc = previewDocs.get(meldScreenId) ?? null;

    return (
      <StackItem
        key={shape.id}
        data-meld-screen-overlay={meldScreenId}
        style={{
          position: "absolute",
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          overflow: "hidden",
          pointerEvents: "none",
        }}
      >
        {previewDoc ? (
          <iframe
            title={`${screen.name} canvas preview`}
            sandbox=""
            srcDoc={previewDoc}
            style={{
              display: "block",
              width: pageBounds.w,
              height: pageBounds.h,
              maxWidth: "none",
              border: "none",
              pointerEvents: "none",
              transform: `scale(${camera.z})`,
              transformOrigin: "top left",
            }}
          />
        ) : (
          <StackItem
            data-meld-screen-placeholder={meldScreenId}
            style={{
              width: pageBounds.w,
              height: pageBounds.h,
              transform: `scale(${camera.z})`,
              transformOrigin: "top left",
            }}
          >
            <VStack
              width="100%"
              height="100%"
              hAlign="center"
              vAlign="center"
              padding={2}
              style={{ backgroundColor: "var(--color-background-primary)" }}
            >
              <EmptyState
                title={
                  screen.state === "empty"
                    ? "Screen not built"
                    : "Preview unavailable"
                }
                description={
                  screen.state === "empty"
                    ? "Build this screen to see it on the canvas."
                    : "This screen could not be rendered safely."
                }
                isCompact
              />
            </VStack>
          </StackItem>
        )}
        {previewDoc ? (
          <StackItem
            style={{
              position: "absolute",
              top: "var(--spacing-2)",
              right: "var(--spacing-2)",
              pointerEvents: "auto",
            }}
          >
            <IconButton
              label={`Preview ${screen.name}`}
              tooltip={`Preview ${screen.name}`}
              icon={"\u25b6"}
              size="sm"
              variant="secondary"
              onClick={() => onPreview(screen.id)}
            />
          </StackItem>
        ) : null}
      </StackItem>
    );
  });
});
