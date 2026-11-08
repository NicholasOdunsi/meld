"use client";

import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { ShelfRoom } from "@meld/contracts";
import { useState } from "react";

export function roomLabel(room: ShelfRoom): string {
  return `${room.projectName} › ${room.roomName}`;
}

export function AddToRoomDialog({
  isOpen,
  count,
  rooms,
  onOpenChange,
  onConfirm,
}: {
  isOpen: boolean;
  count: number;
  rooms: ShelfRoom[];
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: (room: ShelfRoom) => void;
}) {
  const [roomId, setRoomId] = useState<string | undefined>(undefined);
  const selected = rooms.find((room) => room.roomId === roomId) ?? rooms[0];
  const confirmLabel = count === 1 ? "Add 1 image" : `Add ${count} images`;

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      purpose="form"
      width="calc(var(--spacing-12) * 9)"
    >
      <Layout
        header={<DialogHeader title="Add to room" onOpenChange={onOpenChange} />}
        content={
          <LayoutContent>
            <VStack gap={3}>
              {rooms.length === 0 ? (
                <Text type="supporting">You don&apos;t have any rooms you can edit yet.</Text>
              ) : (
                <Selector
                  label="Room"
                  hasSearch
                  options={rooms.map((room) => ({
                    value: room.roomId,
                    label: roomLabel(room),
                  }))}
                  value={selected?.roomId}
                  onChange={setRoomId}
                />
              )}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} justify="end">
              <Button label="Cancel" variant="secondary" onClick={() => onOpenChange(false)} />
              <Button
                label={confirmLabel}
                variant="primary"
                isDisabled={!selected}
                onClick={() => {
                  if (!selected) return;
                  onConfirm(selected);
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
