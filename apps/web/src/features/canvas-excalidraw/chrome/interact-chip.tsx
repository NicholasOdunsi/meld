"use client";

import { Card } from "@astryxdesign/core/Card";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { ToggleButton } from "@astryxdesign/core/ToggleButton";
import { sceneToContainer, type SelectionSummary } from "./selection";

// While an awake screen is in Interact, this sits under it (where the selection pill would be)
// so there is always a visible way back to selecting, even with nothing selected.
export function InteractChip({ bounds, view, onToggle }: {
  bounds: SelectionSummary["bounds"];
  view: { scrollX: number; scrollY: number; zoom: number };
  onToggle: () => void;
}) {
  const anchor = sceneToContainer({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height }, view);
  return (
    <Card
      padding={0.5}
      data-testid="interact-chip"
      style={{
        position: "absolute", left: 0, top: 0, zIndex: 6,
        transform: `translate(calc(${anchor.x}px - 50%), calc(${anchor.y}px + var(--spacing-2)))`,
      }}
    >
      <HStack gap={1.5} align="center" paddingInline={1}>
        <ToggleButton label="Interact" tooltip="Back to selecting" size="sm" isPressed onPressedChange={() => onToggle()} />
        <Text type="supporting">Interacting</Text>
      </HStack>
    </Card>
  );
}
