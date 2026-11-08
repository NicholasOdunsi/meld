"use client";

import { AspectRatio } from "@astryxdesign/core/AspectRatio";
import { Button } from "@astryxdesign/core/Button";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { Lightbox } from "@astryxdesign/core/Lightbox";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { VStack } from "@astryxdesign/core/VStack";
import type { InspirationItemView, ShelfRoom } from "@meld/contracts";
import { useState } from "react";
import { roomLabel } from "./add-to-room-dialog";
import { ConfirmDeleteDialog } from "./confirm-delete-dialog";

export function InspirationDetail({
  workspaceId,
  items,
  openItemId,
  rooms,
  onOpenItemChange,
  onNoteSaved,
  onDelete,
}: {
  workspaceId: string;
  items: InspirationItemView[];
  openItemId: string | null;
  rooms: ShelfRoom[];
  onOpenItemChange: (itemId: string | null) => void;
  onNoteSaved: (itemId: string, note: string) => Promise<void>;
  onDelete: (itemId: string) => Promise<void>;
}) {
  const index = items.findIndex((item) => item.id === openItemId);
  const item = index >= 0 ? items[index] : undefined;
  const [draftNote, setDraftNote] = useState<{ itemId: string; value: string } | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  if (!item) return null;

  const note = draftNote?.itemId === item.id ? draftNote.value : (item.note ?? "");
  const usedIn = rooms.filter((room) => item.roomIds.includes(room.roomId));
  const previous = items[index - 1];
  const next = items[index + 1];
  const close = (isOpen: boolean) => {
    if (!isOpen) onOpenItemChange(null);
  };

  return (
    <Dialog isOpen onOpenChange={close} width="calc(var(--spacing-12) * 20)" maxHeight="90vh">
      <Layout
        header={<DialogHeader title="Inspiration" onOpenChange={close} />}
        content={
          <LayoutContent>
            <HStack gap={6} data-testid="inspiration-detail">
              <VStack gap={2} width="calc(var(--spacing-12) * 12)">
                <ClickableCard label="Zoom image" onClick={() => setIsZoomed(true)} padding={0}>
                  <AspectRatio ratio={item.width / item.height} fit="contain">
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
                    <img
                      src={item.imageUrl ?? ""}
                      alt={item.note ?? "Inspiration image"}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                        display: "block",
                      }}
                    />
                  </AspectRatio>
                </ClickableCard>
                <HStack gap={2} justify="between">
                  <Button
                    label="Previous image"
                    variant="ghost"
                    size="sm"
                    isDisabled={!previous}
                    onClick={() => previous && onOpenItemChange(previous.id)}
                  />
                  <Button
                    label="Next image"
                    variant="ghost"
                    size="sm"
                    isDisabled={!next}
                    onClick={() => next && onOpenItemChange(next.id)}
                  />
                </HStack>
              </VStack>
              <VStack gap={4} width="fill">
                <TextArea
                  label="Note"
                  value={note}
                  onChange={(value) => setDraftNote({ itemId: item.id, value })}
                />
                <Button
                  label="Save note"
                  variant="secondary"
                  size="sm"
                  onClick={() => void onNoteSaved(item.id, note)}
                />
                {item.sourceUrl ? (
                  <VStack gap={1}>
                    <Text type="label">Source</Text>
                    <Link href={item.sourceUrl} isExternalLink>
                      {new URL(item.sourceUrl).hostname}
                    </Link>
                  </VStack>
                ) : null}
                <VStack gap={1}>
                  <Text type="label">Saved</Text>
                  <Text type="supporting">{new Date(item.createdAt).toLocaleDateString()}</Text>
                </VStack>
                <VStack gap={1}>
                  <Text type="label">Used in</Text>
                  {usedIn.length === 0 ? (
                    <Text type="supporting">No rooms yet</Text>
                  ) : (
                    usedIn.map((room) => (
                      <Link
                        key={room.roomId}
                        href={`/${workspaceId}/rooms/${room.roomId}?tab=inspiration`}
                      >
                        {roomLabel(room)}
                      </Link>
                    ))
                  )}
                </VStack>
                <Button
                  label="Delete image"
                  variant="destructive"
                  size="sm"
                  onClick={() => setIsConfirmingDelete(true)}
                />
              </VStack>
            </HStack>
            <Lightbox
              isOpen={isZoomed}
              onOpenChange={setIsZoomed}
              hasZoom
              media={{ src: item.imageUrl ?? "", alt: item.note ?? "Inspiration image" }}
            />
            <ConfirmDeleteDialog
              isOpen={isConfirmingDelete}
              count={1}
              onOpenChange={setIsConfirmingDelete}
              onConfirm={() => {
                void onDelete(item.id);
                onOpenItemChange(null);
              }}
            />
          </LayoutContent>
        }
      />
    </Dialog>
  );
}
