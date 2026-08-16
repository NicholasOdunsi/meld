"use client";

import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { StackItem } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import {
  PixelFolderOpen as FolderOpen,
  PixelLightBulb as LightBulb,
} from "@/ui/pixel-icons";

export function StartingPointCards({
  onStartRoom,
  onImportProject,
  backgroundColor = "var(--color-background-surface)",
}: {
  onStartRoom: () => void;
  onImportProject: () => void;
  backgroundColor?: string;
}) {
  return (
    <HStack gap={4} width="100%">
      <StackItem size="fill" style={{ flexBasis: 0 }}>
        <ClickableCard
          label="Start a Room"
          padding={5}
          width="100%"
          style={{ backgroundColor }}
          onClick={onStartRoom}
        >
          <VStack gap={3}>
            <Icon icon={LightBulb} size="md" color="primary" />
            <Text type="label">Start a Room</Text>
          </VStack>
        </ClickableCard>
      </StackItem>
      <StackItem size="fill" style={{ flexBasis: 0 }}>
        <ClickableCard
          label="Import project"
          padding={5}
          width="100%"
          style={{ backgroundColor }}
          onClick={onImportProject}
        >
          <VStack gap={3}>
            <Icon icon={FolderOpen} size="md" color="primary" />
            <Text type="label">Import project</Text>
          </VStack>
        </ClickableCard>
      </StackItem>
    </HStack>
  );
}
