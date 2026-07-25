"use client";

import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

export function UploadDialog({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange}>
      <DialogHeader
        title="Upload what you have"
        onOpenChange={onOpenChange}
        hasDivider
      />
      <VStack gap={4} padding={4}>
        <Text type="supporting">
          Upload documents, notes, or an HTML export. Meld reads the
          text and keeps it in the room as context.
        </Text>
      </VStack>
    </Dialog>
  );
}
