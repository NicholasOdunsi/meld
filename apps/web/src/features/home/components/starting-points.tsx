"use client";

import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Spinner } from "@astryxdesign/core/Spinner";
import { VStack } from "@astryxdesign/core/VStack";
import { CreateRoomDialog } from "./create-room-dialog";
import { StartingPointCards } from "./starting-point-cards";
import {
  STARTING_POINT_ACCEPTED_FILE_TYPES,
  useStartingPointActions,
} from "./use-starting-point-actions";

export function StartingPoints({
  organizationId,
  isCompact = false,
}: {
  organizationId: string;
  isCompact?: boolean;
}) {
  const {
    fileInputRef,
    isCreateOpen,
    setIsCreateOpen,
    isImporting,
    handleStartRoom,
    openFilePicker,
    handleFilesSelected,
  } = useStartingPointActions(organizationId);

  return (
    <>
      {isCompact ? (
        <HStack gap={2}>
          <Button
            label="New room"
            variant="primary"
            size="sm"
            onClick={handleStartRoom}
          />
          <Button
            label="Import"
            variant="secondary"
            size="sm"
            onClick={openFilePicker}
          />
        </HStack>
      ) : (
        <StartingPointCards
          onStartRoom={handleStartRoom}
          onImportProject={openFilePicker}
        />
      )}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={STARTING_POINT_ACCEPTED_FILE_TYPES}
        hidden
        data-testid="import-file-input"
        onChange={handleFilesSelected}
      />
      <CreateRoomDialog
        organizationId={organizationId}
        isOpen={isCreateOpen}
        onOpenChange={setIsCreateOpen}
      />
      {isImporting ? (
        <VStack
          hAlign="center"
          vAlign="center"
          width="100%"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            backgroundColor: "var(--color-overlay)",
            backdropFilter: "blur(2px)",
          }}
        >
          <Spinner size="lg" label="Importing your files…" />
        </VStack>
      ) : null}
    </>
  );
}
