"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Selector } from "@astryxdesign/core/Selector";
import { VStack } from "@astryxdesign/core/VStack";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { moveRoom } from "@/features/rooms/actions";
import { actionErrorMessage } from "@/ui/action-error";
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
  const destinationProjects = projects.filter(
    (project) => project.id !== room.projectId,
  );
  const selectionKey = `${room.id}:${room.projectId}:${destinationProjects
    .map((project) => project.id)
    .join(",")}`;
  const [projectId, setProjectId] = useState(
    destinationProjects[0]?.id ?? "",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openSelectionKey, setOpenSelectionKey] = useState(
    isOpen ? selectionKey : null,
  );

  if (isOpen && openSelectionKey !== selectionKey) {
    setOpenSelectionKey(selectionKey);
    setProjectId(destinationProjects[0]?.id ?? "");
    setIsSubmitting(false);
    setError(null);
  } else if (!isOpen && openSelectionKey !== null) {
    setOpenSelectionKey(null);
  }

  async function handleMove() {
    if (!projectId) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const result = await moveRoom({
        workspaceId,
        roomId: room.id,
        projectId,
      });
      if (result.status === "error") {
        setError(result.message);
        setIsSubmitting(false);
        return;
      }
      onMoved(result.projectId);
      onOpenChange(false);
      router.refresh();
    } catch (submitError) {
      setError(actionErrorMessage(submitError, MOVE_ROOM_ERROR));
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
          options={destinationProjects.map((project) => ({
            value: project.id,
            label: project.name,
          }))}
          value={projectId || undefined}
          onChange={setProjectId}
          isDisabled={isSubmitting || destinationProjects.length === 0}
          disabledMessage={
            isSubmitting
              ? "Room move in progress"
              : "No other Projects are available"
          }
        />
        <Button
          label="Move room"
          variant="primary"
          isDisabled={
            isSubmitting || !projectId || destinationProjects.length === 0
          }
          isLoading={isSubmitting}
          onClick={handleMove}
        />
      </VStack>
    </Dialog>
  );
}
