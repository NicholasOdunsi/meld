"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import {
  Layout,
  LayoutContent,
  LayoutFooter,
} from "@astryxdesign/core/Layout";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { deleteRoom } from "../actions";
import { actionErrorMessage } from "@/ui/action-error";

export function DeleteRoomDialog({
  workspaceId,
  roomId,
  isOpen,
  onOpenChange,
}: {
  workspaceId: string;
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
      await deleteRoom({ workspaceId, roomId });
      onOpenChange(false);
      const roomPath = `/${workspaceId}/rooms/${roomId}`;
      if (pathname === roomPath || pathname?.startsWith(`${roomPath}/`)) {
        router.push(`/${workspaceId}`);
      }
      router.refresh();
    } catch (submitError) {
      setError(
        actionErrorMessage(submitError, "We could not delete the room."),
      );
      setIsDeleting(false);
    }
  }

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      width="calc(var(--spacing-12) * 8)"
    >
      <Layout
        header={
          <DialogHeader
            title="Delete room"
            subtitle="This permanently deletes everything in the room. This can't be undone."
            onOpenChange={onOpenChange}
          />
        }
        content={
          <LayoutContent>
            {error ? <Banner status="error" title={error} /> : null}
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
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
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
