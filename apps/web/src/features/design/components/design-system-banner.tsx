"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { VStack } from "@astryxdesign/core/VStack";
import { useRef, useState } from "react";
import { resolveMimeType } from "@/features/rooms/attachment-mime";
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
    // Browsers frequently report an empty/generic MIME type for .md files
    // (and others); fall back to the extension-derived type so those aren't
    // silently rejected -- see attachment-mime.ts.
    const mimeType = resolveMimeType(file.name, file.type);
    if (!ACCEPTED_MIME_TYPES[mimeType]) return;
    void file.arrayBuffer().then((buffer) => {
      void distillation.upload({
        fileName: file.name,
        mimeType,
        bytes: new Uint8Array(buffer),
      });
    });
  };

  const isBusy =
    distillation.status === "uploading" || distillation.status === "distilling";

  // Short single-line title, no description, and a one-word "Upload" action
  // so the Banner header never wraps one-word-per-line in the narrow Agents
  // panel -- the long "Upload design system" label was eating the whole row
  // and squeezing the text into a tiny column.
  const title = isBusy
    ? "Distilling your design system…"
    : distillation.status === "failed" && distillation.message
      ? distillation.message
      : "No design system yet";

  return (
    <VStack gap={0} data-testid="design-system-banner">
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
      <Banner
        status="info"
        title={title}
        // Empty node in the icon slot drops the status glyph, giving the
        // title more room in the narrow Agents panel (the slot always
        // renders, so this is the way to suppress the icon).
        icon={<></>}
        isDismissable
        onDismiss={() => setDismissed(true)}
        endContent={
          isBusy ? undefined : (
            <Button
              label="Upload"
              size="sm"
              variant="secondary"
              isDisabled={isBusy}
              onClick={() => inputRef.current?.click()}
            />
          )
        }
      />
    </VStack>
  );
}
