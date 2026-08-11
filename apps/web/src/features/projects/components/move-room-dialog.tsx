"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Selector } from "@astryxdesign/core/Selector";
import { VStack } from "@astryxdesign/core/VStack";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { moveRoom } from "@/features/rooms/actions";
import type { ProjectSummary } from "../schemas";

const MOVE_ROOM_ERROR = "We could not move the room.";

export type MoveRoomDialogTarget = {
  id: string;
  name: string;
  projectId: string;
};

export function MoveRoomDialog({
  workspaceId,
  room,
  projects,
  isOpen,
  onOpenChange,
  onMoved,
}: {
  workspaceId: string;
  room: MoveRoomDialogTarget;
  projects: ProjectSummary[];
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onMoved: (projectId: string) => void;
}) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(room.projectId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openRoomId, setOpenRoomId] = useState(isOpen ? room.id : null);

  if (isOpen && openRoomId !== room.id) {
    setOpenRoomId(room.id);
    setProjectId(room.projectId);
    setIsSubmitting(false);
    setError(null);
  } else if (!isOpen && openRoomId !== null) {
    setOpenRoomId(null);
  }

  async function handleMove() {
    if (projectId === room.projectId) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const movedProjectId = await moveRoom({
        workspaceId,
        roomId: room.id,
        projectId,
      });
      onMoved(movedProjectId);
      onOpenChange(false);
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : MOVE_ROOM_ERROR,
      );
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      purpose="form"
      width="calc(var(--spacing-12) * 9)"
    >
      <DialogHeader title={`Move ${room.name}`} onOpenChange={onOpenChange} />
      <VStack gap={4} padding={4}>
        {error ? <Banner status="error" title={error} /> : null}
        <Selector
          label="Project"
          options={projects.map((project) => ({
            value: project.id,
            label: project.name,
          }))}
          value={projectId}
          onChange={setProjectId}
          isDisabled={isSubmitting}
          disabledMessage="Room move in progress"
        />
        <Button
          label="Move room"
          variant="primary"
          isDisabled={isSubmitting || projectId === room.projectId}
          isLoading={isSubmitting}
          onClick={handleMove}
        />
      </VStack>
    </Dialog>
  );
}
