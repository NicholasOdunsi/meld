"use client";

import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";

export function ConfirmDeleteDialog({
  isOpen,
  count,
  onOpenChange,
  onConfirm,
  title = count === 1 ? "Delete 1 image?" : `Delete ${count} images?`,
  description = "They'll also be removed from any rooms using them.",
  confirmLabel = "Delete",
}: {
  isOpen: boolean;
  count: number;
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
}) {
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      purpose="required"
      width="calc(var(--spacing-12) * 8)"
    >
      <Layout
        header={<DialogHeader title={title} onOpenChange={onOpenChange} />}
        content={
          <LayoutContent>
            <Text>{description}</Text>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} justify="end">
              <Button label="Cancel" variant="secondary" onClick={() => onOpenChange(false)} />
              <Button
                label={confirmLabel}
                variant="destructive"
                onClick={() => {
                  onConfirm();
                  onOpenChange(false);
                }}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
