"use client";

import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { useToast } from "@astryxdesign/core/Toast";
import { VStack } from "@astryxdesign/core/VStack";
import type { InspirationItemView, ShelfRoom } from "@meld/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  deleteInspirationItems,
  linkInspirationToRoom,
  unlinkInspirationFromRoom,
  updateInspirationNote,
} from "../inspiration-actions";
import { listEditableRooms } from "../inspiration-reader";
import { InspirationDetail } from "./inspiration-detail";
import { InspirationGrid } from "./inspiration-grid";
import { LibraryPickerDialog } from "./library-picker-dialog";
import { SelectionBar } from "./selection-bar";

const ACTION_FAILED = "That didn't work. Try again.";
const NO_SELECTION: ReadonlySet<string> = new Set();

export function RoomInspirationSurface({
  workspaceId,
  roomId,
  items,
  canEdit,
}: {
  workspaceId: string;
  roomId: string;
  items: InspirationItemView[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(NO_SELECTION);
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [isPicking, setIsPicking] = useState(false);
  const [rooms, setRooms] = useState<ShelfRoom[]>([]);
  const itemIds = useMemo(() => items.map((item) => item.id), [items]);

  useEffect(() => {
    void listEditableRooms(workspaceId).then(setRooms);
  }, [workspaceId]);

  async function run(action: () => Promise<{ status: string }>) {
    const result = await action();
    if (result.status === "error") toast({ type: "error", body: ACTION_FAILED });
    setSelectedIds(NO_SELECTION);
    router.refresh();
  }

  function setSelected(itemId: string, isSelected: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (isSelected) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  }

  return (
    <VStack gap={4} padding={6} data-testid="room-inspiration">
      {canEdit ? (
        <HStack gap={2} align="center" justify="between">
          <SelectionBar
            count={selectedIds.size}
            onClear={() => setSelectedIds(NO_SELECTION)}
            actions={[
              {
                label: "Remove from room",
                onClick: () => void run(() => unlinkInspirationFromRoom({ roomId, itemIds: [...selectedIds] })),
              },
            ]}
          />
          <Button label="Add from library" variant="secondary" size="sm" onClick={() => setIsPicking(true)} />
        </HStack>
      ) : null}
      <InspirationGrid
        items={items}
        selectedIds={canEdit ? selectedIds : NO_SELECTION}
        onSelectedChange={canEdit ? setSelected : () => undefined}
        onOpen={setOpenItemId}
        hideSelection={!canEdit}
      />
      <InspirationDetail
        workspaceId={workspaceId}
        items={items}
        openItemId={openItemId}
        rooms={rooms}
        onOpenItemChange={setOpenItemId}
        onNoteSaved={(itemId, note) => run(() => updateInspirationNote({ itemId, note }))}
        onDelete={(itemId) => run(() => deleteInspirationItems({ itemIds: [itemId] }))}
      />
      {canEdit ? (
        <LibraryPickerDialog
          isOpen={isPicking}
          workspaceId={workspaceId}
          excludeIds={itemIds}
          onOpenChange={setIsPicking}
          onConfirm={(picked) => void run(() => linkInspirationToRoom({ roomId, itemIds: picked }))}
        />
      ) : null}
    </VStack>
  );
}
