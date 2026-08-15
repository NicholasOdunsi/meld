"use client";

import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { useRef, useState } from "react";
import { useDesignProfileDistillation } from "../use-design-profile-distillation";

const ACCEPTED_MIME_TYPES: Record<string, boolean> = {
  "text/plain": true,
  "text/markdown": true,
  "text/html": true,
  "application/pdf": true,
};
const ACCEPT_ATTR =
  ".md,.txt,.html,.htm,.pdf,text/plain,text/markdown,text/html,application/pdf";

export function DesignSystemBanner({
  roomId,
  onResolved,
}: {
  roomId: string;
  onResolved?: () => void | Promise<void>;
}) {
  const [dismissed, setDismissed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const distillation = useDesignProfileDistillation({ roomId, onResolved });

  if (dismissed) return null;

  const handleFile = (file: File) => {
    if (!ACCEPTED_MIME_TYPES[file.type]) return;
    void file.arrayBuffer().then((buffer) => {
      void distillation.upload({
        fileName: file.name,
        mimeType: file.type,
        bytes: new Uint8Array(buffer),
      });
    });
  };

  const isBusy =
    distillation.status === "uploading" || distillation.status === "distilling";

  return (
    <HStack gap={2} padding={2} vAlign="center" width="100%" data-testid="design-system-banner">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) handleFile(file);
          event.currentTarget.value = "";
        }}
      />
      {distillation.status === "distilling" || distillation.status === "uploading" ? (
        <HStack gap={1} vAlign="center">
          <Spinner size="sm" label="Distilling design system" />
          <Text type="supporting" color="secondary">Distilling your design system…</Text>
        </HStack>
      ) : (
        <>
          <Text type="supporting" color="secondary">
            No design system yet — upload one to style generated screens.
          </Text>
          <Button
            label="Upload design system"
            size="sm"
            variant="secondary"
            isDisabled={isBusy}
            onClick={() => inputRef.current?.click()}
          />
        </>
      )}
      {distillation.status === "failed" && distillation.message ? (
        <Text type="supporting" color="secondary">{distillation.message}</Text>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        label="Dismiss"
        onClick={() => setDismissed(true)}
      />
    </HStack>
  );
}
