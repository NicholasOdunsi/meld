"use client";

import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";

export type SelectionAction = {
  label: string;
  variant?: "primary" | "secondary" | "destructive";
  onClick: () => void;
};

export function SelectionBar({
  count,
  actions,
  onClear,
}: {
  count: number;
  actions: SelectionAction[];
  onClear: () => void;
}) {
  if (count === 0) return null;
  return (
    <HStack gap={2} align="center" data-testid="inspiration-selection-bar">
      <Text type="label">{`${count} selected`}</Text>
      {actions.map((action) => (
        <Button
          key={action.label}
          label={action.label}
          variant={action.variant ?? "secondary"}
          size="sm"
          onClick={action.onClick}
        />
      ))}
      <Button label="Clear" variant="ghost" size="sm" onClick={onClear} />
    </HStack>
  );
}
