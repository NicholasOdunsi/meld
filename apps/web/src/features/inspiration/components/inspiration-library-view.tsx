"use client";

import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { FileInput } from "@astryxdesign/core/FileInput";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent, LayoutHeader } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { InspirationTabs } from "./inspiration-tabs";
import type { ShelfRoom } from "@meld/contracts";
import { useEffect, useState } from "react";
import { listEditableRooms, type LibraryPage } from "../inspiration-reader";
import { useInspirationLibrary } from "../use-inspiration-library";
import { AddToRoomDialog } from "./add-to-room-dialog";
import { ConfirmDeleteDialog } from "./confirm-delete-dialog";
import { InspirationDetail } from "./inspiration-detail";
import { InspirationGrid } from "./inspiration-grid";
import { SelectionBar } from "./selection-bar";

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif";
const EMPTY_HINT = "Drag images onto the Orion icon in your menu bar, or drop them here.";

function filesFrom(value: File | File[] | null): File[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function InspirationLibraryView({
  workspaceId,
  initialPage,
  initialOpenItemId,
}: {
  workspaceId: string;
  initialPage: LibraryPage;
  initialOpenItemId: string | null;
}) {
  const library = useInspirationLibrary({ workspaceId, initialPage });
  const [rooms, setRooms] = useState<ShelfRoom[]>([]);
  const [openItemId, setOpenItemId] = useState(initialOpenItemId);
  const [isAddingToRoom, setIsAddingToRoom] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const { uploadFiles } = library;

  useEffect(() => {
    void listEditableRooms(workspaceId).then(setRooms);
  }, [workspaceId]);

  useEffect(() => {
    // ⌘V anywhere on the page saves a copied image.
    const onPaste = (event: ClipboardEvent) => {
      const pasted = Array.from(event.clipboardData?.files ?? []).filter((file) =>
        file.type.startsWith("image/"),
      );
      if (pasted.length > 0) void uploadFiles(pasted);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [uploadFiles]);

  const count = library.items.length;
  const isEmpty = count === 0 && library.uploadingCount === 0;

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider>
          <VStack gap={3} paddingInline={6} paddingBlock={4}>
            <HStack gap={2} align="center">
              <Heading level={1}>Inspiration</Heading>
              {count > 0 ? (
                <Text type="supporting">{count === 1 ? "1 image" : `${count} images`}</Text>
              ) : null}
            </HStack>
            <InspirationTabs workspaceId={workspaceId} active="library" />
            <FileInput
              label="Add images"
              isLabelHidden
              mode="dropzone"
              isMultiple
              accept={ACCEPT}
              value={[]}
              onChange={(files) => void library.uploadFiles(filesFrom(files))}
              placeholder="Drop images here or click to choose"
              width="100%"
            />
            <SelectionBar
              count={library.selectedIds.size}
              onClear={library.clearSelection}
              actions={[
                {
                  label: "Add to room…",
                  variant: "primary",
                  onClick: () => setIsAddingToRoom(true),
                },
                {
                  label: "Delete",
                  variant: "destructive",
                  onClick: () => setIsConfirmingDelete(true),
                },
              ]}
            />
          </VStack>
        </LayoutHeader>
      }
    >
      <LayoutContent padding={6}>
        {isEmpty ? (
          <VStack data-testid="inspiration-empty">
            <EmptyState title="Nothing here yet." description={EMPTY_HINT} />
          </VStack>
        ) : (
          <VStack gap={4}>
            <InspirationGrid
              items={library.items}
              selectedIds={library.selectedIds}
              onSelectedChange={library.setSelected}
              onOpen={setOpenItemId}
              uploadingCount={library.uploadingCount}
            />
            {library.hasMore ? (
              <HStack justify="center">
                <Button
                  label="Load more"
                  variant="secondary"
                  isLoading={library.isLoadingMore}
                  onClick={() => void library.loadMore()}
                />
              </HStack>
            ) : null}
          </VStack>
        )}
      </LayoutContent>
      <InspirationDetail
        workspaceId={workspaceId}
        items={library.items}
        openItemId={openItemId}
        rooms={rooms}
        onOpenItemChange={setOpenItemId}
        onNoteSaved={library.saveNote}
        onDelete={library.deleteOne}
      />
      <AddToRoomDialog
        isOpen={isAddingToRoom}
        count={library.selectedIds.size}
        rooms={rooms}
        onOpenChange={setIsAddingToRoom}
        onConfirm={(room) => void library.addSelectedToRoom(room)}
      />
      <ConfirmDeleteDialog
        isOpen={isConfirmingDelete}
        count={library.selectedIds.size}
        onOpenChange={setIsConfirmingDelete}
        onConfirm={() => void library.deleteSelected()}
      />
    </Layout>
  );
}
