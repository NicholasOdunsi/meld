"use client";

import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import { ToggleButton } from "@astryxdesign/core/ToggleButton";
import { sceneToContainer, type SelectionSummary } from "./selection";

export type PillSwatch = { label: string; color: string };
export type ScreenAction = { label: string; onPress: () => void; pressed?: boolean };

function Swatch({ color }: { color: string }) {
  return <svg viewBox="0 0 16 16" width="1em" height="1em" aria-hidden><circle cx="8" cy="8" r="6" fill={color} /></svg>;
}

export function SelectionPill({ selection, view, swatches, onStroke, onStrokeWidth, onFontSize, screenActions = [], shapeActions = [] }: {
  selection: SelectionSummary;
  view: { scrollX: number; scrollY: number; zoom: number };
  swatches: readonly PillSwatch[];
  onStroke: (color: string) => void;
  onStrokeWidth: (width: 1 | 4) => void;
  onFontSize: (size: 16 | 20 | 28) => void;
  screenActions?: readonly ScreenAction[];
  shapeActions?: readonly ScreenAction[];
}) {
  if (selection.kind === "screen" && screenActions.length === 0) return null;
  const anchor = sceneToContainer({ x: selection.bounds.x + selection.bounds.width / 2, y: selection.bounds.y + selection.bounds.height }, view);
  const actions = selection.kind === "screen" ? screenActions : shapeActions;
  return (
    <Card
      padding={0.5}
      data-testid="selection-pill"
      style={{
        position: "absolute", left: 0, top: 0, zIndex: 6,
        transform: `translate(calc(${anchor.x}px - 50%), calc(${anchor.y}px + var(--spacing-2)))`,
      }}
    >
      <HStack gap={1} align="center">
        {selection.kind !== "screen" ? (
          <>
            {swatches.map((swatch) => (
              <IconButton key={swatch.label} label={swatch.label} tooltip={swatch.label} variant="ghost" size="sm" icon={<Swatch color={swatch.color} />} onClick={() => onStroke(swatch.color)} />
            ))}
            <Divider orientation="vertical" />
          </>
        ) : null}
        {selection.kind === "shape" ? (
          <>
            <Button label="Thin" size="sm" variant="ghost" onClick={() => onStrokeWidth(1)} />
            <Button label="Bold" size="sm" variant="ghost" onClick={() => onStrokeWidth(4)} />
          </>
        ) : null}
        {selection.kind === "text" ? (
          <>
            <IconButton label="Small text" tooltip="Small" variant="ghost" size="sm" icon={<>S</>} onClick={() => onFontSize(16)} />
            <IconButton label="Medium text" tooltip="Medium" variant="ghost" size="sm" icon={<>M</>} onClick={() => onFontSize(20)} />
            <IconButton label="Large text" tooltip="Large" variant="ghost" size="sm" icon={<>L</>} onClick={() => onFontSize(28)} />
          </>
        ) : null}
        {actions.map((action) => action.pressed === undefined ? (
          <Button key={action.label} label={action.label} size="sm" variant={action.label === "Add to chat" ? "primary" : "ghost"} onClick={action.onPress} />
        ) : (
          <ToggleButton key={action.label} label={action.label} size="sm" isPressed={action.pressed} onPressedChange={() => action.onPress()} />
        ))}
      </HStack>
    </Card>
  );
}
