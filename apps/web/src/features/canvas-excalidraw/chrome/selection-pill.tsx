"use client";

import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { HStack } from "@astryxdesign/core/HStack";
import { ToggleButton } from "@astryxdesign/core/ToggleButton";
import { sceneToContainer, type SelectionSummary } from "./selection";

export type ScreenAction = { label: string; onPress: () => void; pressed?: boolean };

export function SelectionPill({ selection, view, screenActions = [], shapeActions = [] }: {
  selection: SelectionSummary;
  view: { scrollX: number; scrollY: number; zoom: number };
  screenActions?: readonly ScreenAction[];
  shapeActions?: readonly ScreenAction[];
}) {
  // Drawn shapes and text edit in the side panel; the pill only carries actions.
  const actions = selection.kind === "screen" ? screenActions : shapeActions;
  if (actions.length === 0) return null;
  const anchor = sceneToContainer({ x: selection.bounds.x + selection.bounds.width / 2, y: selection.bounds.y + selection.bounds.height }, view);
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
        {actions.map((action) => action.pressed === undefined ? (
          <Button key={action.label} label={action.label} size="sm" variant={action.label === "Add to chat" ? "primary" : "ghost"} onClick={action.onPress} />
        ) : (
          <ToggleButton key={action.label} label={action.label} size="sm" isPressed={action.pressed} onPressedChange={() => action.onPress()} />
        ))}
      </HStack>
    </Card>
  );
}
