"use client";

import { Card } from "@astryxdesign/core/Card";
import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Text } from "@astryxdesign/core/Text";
import { stepZoom, zoomAroundCenter, type Viewport } from "./zoom";

const Minus = () => <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><path d="M6 12h12" /></svg>;
const Plus = () => <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><path d="M6 12h12M12 6v12" /></svg>;

export function ZoomControl({ view, onZoom }: { view: Viewport; onZoom: (next: { scrollX: number; scrollY: number; zoom: number }) => void }) {
  return (
    <Card padding={0.5} style={{ position: "absolute", insetInlineEnd: "var(--spacing-3)", bottom: "var(--spacing-3)", zIndex: 5 }}>
      <HStack gap={1} align="center">
        <IconButton label="Zoom out" variant="ghost" size="sm" icon={<Minus />} onClick={() => onZoom(zoomAroundCenter(view, stepZoom(view.zoom, -1)))} />
        <Text type="label" aria-live="polite">{Math.round(view.zoom * 100)}%</Text>
        <IconButton label="Zoom in" variant="ghost" size="sm" icon={<Plus />} onClick={() => onZoom(zoomAroundCenter(view, stepZoom(view.zoom, 1)))} />
      </HStack>
    </Card>
  );
}
