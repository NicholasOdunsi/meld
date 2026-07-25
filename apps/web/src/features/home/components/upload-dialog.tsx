"use client";

import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { FileInput } from "@astryxdesign/core/FileInput";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createRoomFromUploads } from "@/features/discovery/actions";
import { MAX_ATTACHMENT_BYTES } from "@/features/discovery/schemas";

type SubmitStatus = {
  type: "error" | "warning";
  message: string;
};

export function UploadDialog({
  organizationId,
  isOpen,
  onOpenChange,
}: {
  organizationId: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<SubmitStatus | null>(null);
  const [isPending, setIsPending] = useState(false);
  // Set once the room exists. Guarantees that a second click navigates
  // to the room already created rather than creating a duplicate.
  const [createdRoomId, setCreatedRoomId] = useState<string | null>(
    null,
  );

  // The dialog stays mounted while closed, so this state would otherwise
  // survive into the next open and a stale createdRoomId would send a
  // fresh selection to the previous room. Reset on the closed-to-open
  // transition, which is correct however the dialog was dismissed.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setFiles([]);
      setStatus(null);
      setIsPending(false);
      setCreatedRoomId(null);
    }
  }

  function goToRoom(roomId: string) {
    router.push(`/${organizationId}/discovery/${roomId}`);
    router.refresh();
  }

  async function handleSubmit() {
    if (createdRoomId) {
      goToRoom(createdRoomId);
      return;
    }

    setIsPending(true);
    setStatus(null);
    const formData = new FormData();
    formData.set("organizationId", organizationId);
    for (const file of files) {
      formData.append("files", file);
    }
    try {
      const { roomId, failedFileNames } =
        await createRoomFromUploads(formData);
      if (failedFileNames.length > 0) {
        // The room is created and reachable; name what did not attach
        // before leaving, then let the user continue into the room.
        setCreatedRoomId(roomId);
        setStatus({
          type: "warning",
          message: `The room was created, but these files did not attach: ${failedFileNames.join(
            ", ",
          )}.`,
        });
        setIsPending(false);
        return;
      }
      goToRoom(roomId);
    } catch (error) {
      setStatus({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "We could not import those files.",
      });
      setIsPending(false);
    }
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange}>
      <DialogHeader
        title="Upload what you have"
        onOpenChange={onOpenChange}
        hasDivider
      />
      <VStack gap={4} padding={4}>
        <Text type="supporting">
          Upload documents, notes, or an HTML export. Meld reads the
          text now and keeps it as room context. Summarizing it into a
          brief arrives with the Product Agent.
        </Text>
        <FileInput
          label="Files"
          value={files}
          onChange={(selection) => {
            if (selection === null) {
              setFiles([]);
              return;
            }
            setFiles(
              Array.isArray(selection) ? selection : [selection],
            );
          }}
          isMultiple
          accept=".txt,.md,.html,.pdf"
          maxSize={MAX_ATTACHMENT_BYTES}
          description="UTF-8 text, Markdown, HTML, or PDF up to 10 MB."
          status={status ?? undefined}
        />
        <Button
          label={createdRoomId ? "Go to room" : "Create room"}
          variant="primary"
          isDisabled={!createdRoomId && files.length === 0}
          isLoading={isPending}
          onClick={handleSubmit}
        />
      </VStack>
    </Dialog>
  );
}
