"use client";

import { useCallback, useRef } from "react";
import type { ChangeEvent } from "react";
import { resolveMimeType } from "@/features/rooms/attachment-mime";
import { useDesignProfileDistillation } from "./use-design-profile-distillation";

const ACCEPTED_MIME_TYPES: Record<string, boolean> = {
  "text/plain": true,
  "text/markdown": true,
  "text/html": true,
  "application/pdf": true,
};

// The picker's `accept` attribute -- exported so callers render the same
// hidden <input> the hook drives.
export const DESIGN_SYSTEM_ACCEPT =
  ".md,.txt,.html,.htm,.pdf,text/plain,text/markdown,text/html,application/pdf";

// Encapsulates the design-system upload plumbing shared by the empty-state
// starter row, the header palette button, and (originally) the banner: a
// hidden file input, mime resolution, and the distill pipeline. Callers
// render `<input ref={inputRef} accept={DESIGN_SYSTEM_ACCEPT} type="file"
// hidden onChange={onInputChange} />` and call `openPicker()` to trigger it.
export function useDesignSystemUpload({
  roomId,
  onResolved,
}: {
  roomId: string;
  onResolved?: () => void | Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const distillation = useDesignProfileDistillation({ roomId, onResolved });

  const handleFile = useCallback(
    (file: File) => {
      // Browsers frequently report an empty/generic MIME for .md files; fall
      // back to the extension-derived type (see attachment-mime.ts).
      const mimeType = resolveMimeType(file.name, file.type);
      if (!ACCEPTED_MIME_TYPES[mimeType]) return;
      void file.arrayBuffer().then((buffer) => {
        void distillation.upload({
          fileName: file.name,
          mimeType,
          bytes: new Uint8Array(buffer),
        });
      });
    },
    [distillation],
  );

  const onInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0];
      if (file) handleFile(file);
      event.currentTarget.value = "";
    },
    [handleFile],
  );

  const openPicker = useCallback(() => inputRef.current?.click(), []);

  const isBusy =
    distillation.status === "uploading" || distillation.status === "distilling";

  return {
    status: distillation.status,
    message: distillation.message,
    isBusy,
    inputRef,
    onInputChange,
    openPicker,
  };
}
