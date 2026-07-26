"use client";

import { Button } from "@astryxdesign/core/Button";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Spinner } from "@astryxdesign/core/Spinner";
import { StackItem } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { useToast } from "@astryxdesign/core/Toast";
import { VStack } from "@astryxdesign/core/VStack";
import { FolderOpen } from "@boxicons/react/FolderOpen";
import { LightBulb } from "@boxicons/react/LightBulb";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { createRoomFromUploads } from "@/features/discovery/actions";
import { CreateRoomDialog } from "./create-room-dialog";

const ACCEPTED_FILE_TYPES = ".txt,.md,.html,.pdf";

export function StartingPoints({
  organizationId,
  isCompact = false,
}: {
  organizationId: string;
  isCompact?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  async function handleFilesSelected(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const files = Array.from(event.target.files ?? []);
    // Let the native input fire again for the same selection next time.
    event.target.value = "";
    if (files.length === 0) {
      return;
    }

    setIsImporting(true);
    const formData = new FormData();
    formData.set("organizationId", organizationId);
    for (const file of files) {
      formData.append("files", file);
    }

    try {
      const { roomId, failedFileNames } =
        await createRoomFromUploads(formData);
      if (failedFileNames.length > 0) {
        toast({
          type: "info",
          body: `The room was created, but these files did not attach: ${failedFileNames.join(
            ", ",
          )}.`,
        });
      }
      router.push(`/${organizationId}/discovery/${roomId}`);
      router.refresh();
    } catch (error) {
      toast({
        type: "error",
        body:
          error instanceof Error
            ? error.message
            : "We could not import those files.",
      });
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <>
      {isCompact ? (
        <HStack gap={2}>
          <Button
            label="New room"
            variant="primary"
            size="sm"
            onClick={() => setIsCreateOpen(true)}
          />
          <Button
            label="Import"
            variant="secondary"
            size="sm"
            onClick={openFilePicker}
          />
        </HStack>
      ) : (
        <HStack gap={4} width="100%">
          <StackItem size="fill">
            <ClickableCard
              label="Start a Discovery Room"
              padding={5}
              width="100%"
              style={{
                backgroundColor: "var(--color-background-surface)",
              }}
              onClick={() => setIsCreateOpen(true)}
            >
              <VStack gap={3}>
                <Icon icon={LightBulb} size="md" color="primary" />
                <Text type="label">Start a Discovery Room</Text>
              </VStack>
            </ClickableCard>
          </StackItem>
          <StackItem size="fill">
            <ClickableCard
              label="Import project"
              padding={5}
              width="100%"
              style={{
                backgroundColor: "var(--color-background-surface)",
              }}
              onClick={openFilePicker}
            >
              <VStack gap={3}>
                <Icon icon={FolderOpen} size="md" color="primary" />
                <Text type="label">Import project</Text>
              </VStack>
            </ClickableCard>
          </StackItem>
        </HStack>
      )}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPTED_FILE_TYPES}
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
