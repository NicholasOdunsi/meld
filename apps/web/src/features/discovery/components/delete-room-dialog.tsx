"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { usePathname, useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { useState } from "react";
import { deleteDiscoveryRoom } from "../actions";

// The subtitle's default line-height reads as too tight over two lines.
// The subtitle is the only "body" text in this dialog, so shadowing the
// token here is scoped to it without a custom line-height prop on Text.
const relaxedSubtitleLineHeight = {
  "--text-body-leading": "1.5",
} as CSSProperties;

// DialogHeader renders the title (h2) and subtitle (span) flush against
// each other with no gap prop exposed, so add the 8px gap via a scoped
// sibling rule instead.
const titleSubtitleGap =
  ".meld-delete-room-dialog h2 + span { margin-top: var(--spacing-2); display: block; }";

export function DeleteRoomDialog({
  organizationId,
  roomId,
  isOpen,
  onOpenChange,
}: {
  organizationId: string;
  roomId: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The Astryx Dialog hides rather than unmounts on close, so a failed
  // delete would otherwise leave the stale error in place next time this
  // room's dialog opens. Reset on the closed-to-open transition, matching
  // CreateRoomDialog's wasOpen pattern.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setError(null);
      setIsDeleting(false);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);
    try {
      await deleteDiscoveryRoom({ organizationId, roomId });
      onOpenChange(false);
      const roomPath = `/${organizationId}/discovery/${roomId}`;
      if (pathname === roomPath || pathname?.startsWith(`${roomPath}/`)) {
        router.push(`/${organizationId}`);
      }
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "We could not delete the room.",
      );
      setIsDeleting(false);
    }
  }

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      width="calc(var(--spacing-12) * 8)"
      padding={3}
    >
      <style>{titleSubtitleGap}</style>
      <VStack
        className="meld-delete-room-dialog"
        style={relaxedSubtitleLineHeight}
      >
        <DialogHeader
          title="Delete room"
          subtitle="This permanently deletes everything in the room. This can't be undone."
          onOpenChange={onOpenChange}
        />
      </VStack>
      <VStack gap={4} padding={3}>
        {error ? <Banner status="error" title={error} /> : null}
        <HStack gap={2} justify="end">
          <Button
            label="Cancel"
            variant="secondary"
            isDisabled={isDeleting}
            onClick={() => onOpenChange(false)}
          />
          <Button
            label="Delete room"
            variant="destructive"
            isLoading={isDeleting}
            onClick={handleDelete}
          />
        </HStack>
      </VStack>
    </Dialog>
  );
}
