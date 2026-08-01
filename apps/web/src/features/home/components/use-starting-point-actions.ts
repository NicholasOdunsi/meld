"use client";

import { useToast } from "@astryxdesign/core/Toast";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { createRoomFromUploads } from "@/features/discovery/actions";

export { ACCEPTED_ATTACHMENT_FILE_TYPES as STARTING_POINT_ACCEPTED_FILE_TYPES } from "@/features/discovery/attachment-mime";

/**
 * Shared behavior behind the "Start a Discovery Room" / "Import project"
 * starting points, so the home page cards and the sidebar's chooser modal
 * (StartRoomDialog) don't duplicate the import/toast/navigation logic.
 */
export function useStartingPointActions(
  organizationId: string,
  onActionStart?: () => void,
) {
  const router = useRouter();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  function handleStartRoom() {
    onActionStart?.();
    setIsCreateOpen(true);
  }

  function openFilePicker() {
    onActionStart?.();
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

  return {
    fileInputRef,
    isCreateOpen,
    setIsCreateOpen,
    isImporting,
    handleStartRoom,
    openFilePicker,
    handleFilesSelected,
  };
}
