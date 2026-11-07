"use client";

import { useToast } from "@astryxdesign/core/Toast";
import { SHELF_ERROR_MESSAGES, type InspirationItemView, type ShelfRoom } from "@meld/contracts";
import { useCallback, useEffect, useState } from "react";
import { prepareImageForUpload } from "./client-image-prep";
import {
  deleteInspirationItems,
  linkInspirationToRoom,
  updateInspirationNote,
  uploadInspirationFromWeb,
} from "./inspiration-actions";
import { listLibrary, type LibraryPage } from "./inspiration-reader";

const DELETE_FAILED = "Couldn't delete. Try again.";
const LINK_FAILED = "Couldn't add to the room. Try again.";
const NOTE_FAILED = "Couldn't save the note. Try again.";
const UPLOAD_FAILED = "Couldn't save that image. Try again.";

function images(count: number): string {
  return count === 1 ? "1 image" : `${count} images`;
}

// A refreshed first page replaces what we had, but anything older the owner
// already paged in stays so "Load more" progress isn't lost.
export function mergeFirstPage(
  page: LibraryPage,
  current: InspirationItemView[],
): InspirationItemView[] {
  if (!page.hasMore) return page.items;
  const freshIds = new Set(page.items.map((entry) => entry.id));
  const oldestFresh = page.items.at(-1)?.createdAt;
  return [
    ...page.items,
    ...current.filter(
      (entry) =>
        !freshIds.has(entry.id) && oldestFresh !== undefined && entry.createdAt < oldestFresh,
    ),
  ];
}

export function useInspirationLibrary({
  workspaceId,
  initialPage,
}: {
  workspaceId: string;
  initialPage: LibraryPage;
}) {
  const toast = useToast();
  const [items, setItems] = useState(initialPage.items);
  const [hasMore, setHasMore] = useState(initialPage.hasMore);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [uploadingCount, setUploadingCount] = useState(0);

  const refresh = useCallback(async () => {
    const page = await listLibrary({ workspaceId, offset: 0 });
    setItems((current) => mergeFirstPage(page, current));
    if (!page.hasMore) setHasMore(false);
  }, [workspaceId]);

  useEffect(() => {
    // The shelf saves while the browser is in the background; pick those up on return.
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const setSelected = useCallback((itemId: string, isSelected: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (isSelected) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  async function loadMore() {
    setIsLoadingMore(true);
    try {
      const page = await listLibrary({ workspaceId, offset: items.length });
      setItems((current) => [
        ...current,
        ...page.items.filter((entry) => !current.some((known) => known.id === entry.id)),
      ]);
      setHasMore(page.hasMore);
    } finally {
      setIsLoadingMore(false);
    }
  }

  async function uploadFiles(files: File[]) {
    for (const file of files) {
      setUploadingCount((count) => count + 1);
      try {
        const prepared = await prepareImageForUpload(file);
        if (!prepared.ok) {
          toast({ type: "error", body: prepared.message });
          continue;
        }
        const form = new FormData();
        form.set("workspaceId", workspaceId);
        form.set("file", prepared.blob, file.name);
        const result = await uploadInspirationFromWeb(form);
        if (!result.ok) {
          // The shared "unavailable" copy promises a shelf retry; the web doesn't retry.
          const body = result.error === "unavailable" ? UPLOAD_FAILED : SHELF_ERROR_MESSAGES[result.error];
          toast({ type: "error", body });
        }
      } finally {
        setUploadingCount((count) => count - 1);
      }
    }
    await refresh();
  }

  async function deleteItems(itemIds: string[]) {
    const result = await deleteInspirationItems({ itemIds });
    if (result.status === "error") {
      toast({ type: "error", body: DELETE_FAILED });
      return;
    }
    setItems((current) => current.filter((entry) => !itemIds.includes(entry.id)));
    clearSelection();
    toast({ type: "info", body: `Deleted ${images(result.count)}.` });
  }

  async function addSelectedToRoom(room: ShelfRoom) {
    const itemIds = [...selectedIds];
    const result = await linkInspirationToRoom({ roomId: room.roomId, itemIds });
    if (result.status === "error") {
      toast({ type: "error", body: LINK_FAILED });
      return;
    }
    setItems((current) =>
      current.map((entry) =>
        itemIds.includes(entry.id) && !entry.roomIds.includes(room.roomId)
          ? { ...entry, roomIds: [...entry.roomIds, room.roomId] }
          : entry,
      ),
    );
    clearSelection();
    toast({ type: "info", body: `Added ${images(itemIds.length)} to ${room.roomName}.` });
  }

  async function saveNote(itemId: string, note: string) {
    const result = await updateInspirationNote({ itemId, note });
    if (result.status === "error") {
      toast({ type: "error", body: NOTE_FAILED });
      return;
    }
    setItems((current) =>
      current.map((entry) => (entry.id === itemId ? { ...entry, note: result.note } : entry)),
    );
  }

  return {
    items,
    hasMore,
    isLoadingMore,
    selectedIds,
    uploadingCount,
    setSelected,
    clearSelection,
    loadMore,
    uploadFiles,
    deleteSelected: () => deleteItems([...selectedIds]),
    deleteOne: (itemId: string) => deleteItems([itemId]),
    addSelectedToRoom,
    saveNote,
  };
}
