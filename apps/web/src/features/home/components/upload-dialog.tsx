"use client";

import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { FileInput } from "@astryxdesign/core/FileInput";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createRoomFromUploads } from "@/features/discovery/actions";

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
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit() {
    setIsPending(true);
    setMessage(null);
    const formData = new FormData();
    formData.set("organizationId", organizationId);
    for (const file of files) {
      formData.append("files", file);
    }
    try {
      const { roomId } = await createRoomFromUploads(formData);
      router.push(`/${organizationId}/discovery/${roomId}`);
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "We could not import those files.",
      );
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
          accept=".txt,.md,.html,.pdf,.png,.jpg,.jpeg,.webp,.gif"
          maxSize={10 * 1024 * 1024}
          status={
            message ? { type: "error", message } : undefined
          }
        />
        <Button
          label="Create room"
          variant="primary"
          isDisabled={files.length === 0}
          isLoading={isPending}
          onClick={handleSubmit}
        />
      </VStack>
    </Dialog>
  );
}
