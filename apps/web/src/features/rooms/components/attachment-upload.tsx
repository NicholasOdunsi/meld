"use client";

import { Button } from "@astryxdesign/core/Button";
import { FileInput } from "@astryxdesign/core/FileInput";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { useState } from "react";
import { ACCEPTED_ATTACHMENT_FILE_TYPES } from "../attachment-mime";
import { uploadAttachment } from "../actions";
import { MAX_ATTACHMENT_BYTES } from "../schemas";
import { actionErrorMessage } from "@/ui/action-error";

export function AttachmentUpload({
  roomId,
  isPersistenceAvailable = true,
}: {
  roomId: string;
  isPersistenceAvailable?: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [result, setResult] = useState<string>();
  const [error, setError] = useState<string>();
  const [isUploading, setIsUploading] = useState(false);

  const upload = async () => {
    if (!file) return;
    setIsUploading(true);
    setError(undefined);
    try {
      const data = new FormData();
      data.set("roomId", roomId);
      data.set("file", file);
      if (caption) data.set("caption", caption);
      const saved = await uploadAttachment(data);
      setResult(`${saved.originalName}: ${saved.extractionStatus}`);
      setFile(null);
      setCaption("");
    } catch (reason) {
      setError(
        actionErrorMessage(reason, "We could not upload the attachment."),
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <VStack gap={3}>
      <FileInput
        label="Attach evidence"
        value={file}
        onChange={(value) => setFile(value as File | null)}
        accept={ACCEPTED_ATTACHMENT_FILE_TYPES}
        maxSize={MAX_ATTACHMENT_BYTES}
        description="Text, Markdown, HTML, CSV/JSON/XML/YAML, PDF, or images up to 10 MB."
        isDisabled={!isPersistenceAvailable}
        disabledMessage="Local attachment persistence requires Supabase."
        status={
          error ? { type: "error", message: error } : undefined
        }
      />
      {file?.type.startsWith("image/") ? (
        <TextInput
          label="Image caption"
          value={caption}
          onChange={setCaption}
          description="Required before an image can contribute textual context."
        />
      ) : null}
      <Button
        label="Upload attachment"
        variant="secondary"
        isDisabled={
          !file ||
          !isPersistenceAvailable ||
          (Boolean(file?.type.startsWith("image/")) && !caption.trim())
        }
        isLoading={isUploading}
        clickAction={upload}
      />
      {result ? <Token label={result} color="green" /> : null}
    </VStack>
  );
}
