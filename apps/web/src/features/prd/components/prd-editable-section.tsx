"use client";

import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { Plus } from "@boxicons/react/Plus";
import { Trash } from "@boxicons/react/Trash";
import { useState, type ReactNode } from "react";

// A document section that can be cleared away (schema still requires the
// field to exist, so "delete" clears its value) and brought back with a
// slim "+ Add" placeholder, mirroring how a word processor lets you delete a
// paragraph down to nothing and start typing again.
export function EditableSection({
  label,
  isCollapsed,
  isDisabled,
  onDelete,
  onRestore,
  children,
}: {
  label: string;
  isCollapsed: boolean;
  isDisabled: boolean;
  onDelete: () => void;
  onRestore: () => void;
  children: ReactNode;
}) {
  const [isHovered, setIsHovered] = useState(false);

  if (isCollapsed) {
    return (
      <Button
        label={`Add ${label}`}
        icon={<Plus pack="basic" size="sm" />}
        variant="ghost"
        size="sm"
        isDisabled={isDisabled}
        onClick={onRestore}
      />
    );
  }

  return (
    <VStack
      gap={2}
      width="100%"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <HStack gap={2} vAlign="center" width="100%" hAlign="between">
        <Heading level={3}>{label}</Heading>
        <span style={{ opacity: isHovered ? 1 : 0 }}>
          <Button
            label={`Remove ${label} section`}
            icon={<Trash pack="basic" size="sm" />}
            variant="ghost"
            size="sm"
            isIconOnly
            isDisabled={isDisabled}
            onClick={onDelete}
          />
        </span>
      </HStack>
      {children}
    </VStack>
  );
}
