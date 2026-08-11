"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteProject } from "@/features/projects/actions";
import type { ProjectDialogTarget } from "./rename-project-dialog";

const DELETE_PROJECT_ERROR = "We could not delete the project.";

export function DeleteProjectDialog({
  workspaceId,
  project,
  isOpen,
  onOpenChange,
}: {
  workspaceId: string;
  project: ProjectDialogTarget;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openProjectId, setOpenProjectId] = useState(
    isOpen ? project.id : null,
  );

  if (isOpen && openProjectId !== project.id) {
    setOpenProjectId(project.id);
    setIsSubmitting(false);
    setError(null);
  } else if (!isOpen && openProjectId !== null) {
    setOpenProjectId(null);
  }

  async function handleDelete() {
    setIsSubmitting(true);
    setError(null);
    try {
      await deleteProject({ workspaceId, projectId: project.id });
      onOpenChange(false);
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : DELETE_PROJECT_ERROR,
      );
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      purpose="required"
      width="calc(var(--spacing-12) * 9)"
    >
      <DialogHeader title={`Delete ${project.name}?`} />
      <VStack gap={4} padding={4}>
        {error ? <Banner status="error" title={error} /> : null}
        <Text>
          Deleting this project does not delete rooms. Move or delete every room
          first. This action cannot be undone.
        </Text>
        <HStack gap={2} hAlign="end">
          <Button
            label="Cancel"
            isDisabled={isSubmitting}
            onClick={() => onOpenChange(false)}
          />
          <Button
            label="Delete project"
            variant="destructive"
            isLoading={isSubmitting}
            onClick={handleDelete}
          />
        </HStack>
      </VStack>
    </Dialog>
  );
}
