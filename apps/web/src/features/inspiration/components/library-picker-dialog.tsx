"use client";

import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import type { InspirationItemView } from "@meld/contracts";
import { useEffect, useState } from "react";
import { listLibrary } from "../inspiration-reader";
import { InspirationGrid } from "./inspiration-grid";

export function LibraryPickerDialog({
  isOpen,
  workspaceId,
  excludeIds,
  onOpenChange,
  onConfirm,
}: {
  isOpen: boolean;
  workspaceId: string;
  excludeIds: string[];
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: (itemIds: string[]) => void;
}) {
  const [items, setItems] = useState<InspirationItemView[]>([]);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  // Reset selection when the dialog opens — adjust during render (not in an
  // effect) so opening never cascades an extra paint after mount.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setSelectedIds(new Set());
  }

  useEffect(() => {
    if (!isOpen) return;
    void listLibrary({ workspaceId, offset: 0 }).then((page) =>
      setItems(page.items.filter((item) => !excludeIds.includes(item.id))),
    );
  }, [isOpen, workspaceId, excludeIds]);

  function setSelected(itemId: string, isSelected: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (isSelected) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  }

  const count = selectedIds.size;
  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="form" width="calc(var(--spacing-12) * 18)" maxHeight="85vh">
      <Layout
        header={<DialogHeader title="Add from library" onOpenChange={onOpenChange} />}
        content={
          <LayoutContent>
            {items.length === 0 ? (
              <Text type="supporting">Everything in your library is already in this room.</Text>
            ) : (
              <InspirationGrid
                items={items}
                selectedIds={selectedIds}
                onSelectedChange={setSelected}
                onOpen={(itemId) => setSelected(itemId, !selectedIds.has(itemId))}
              />
            )}
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} justify="end">
              <Button label="Cancel" variant="secondary" onClick={() => onOpenChange(false)} />
              <Button
                label={count === 1 ? "Add 1 image" : `Add ${count} images`}
                variant="primary"
                isDisabled={count === 0}
                onClick={() => {
                  onConfirm([...selectedIds]);
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
