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
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteProject } from "@/features/projects/actions";
import type { ProjectDialogTarget } from "./rename-project-dialog";
import { actionErrorMessage } from "@/ui/action-error";

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
      const result = await deleteProject({
        workspaceId,
        projectId: project.id,
      });
      if (result.status !== "deleted") {
        setError(result.message);
        setIsSubmitting(false);
        return;
      }
      onOpenChange(false);
      router.refresh();
    } catch (submitError) {
      setError(actionErrorMessage(submitError, DELETE_PROJECT_ERROR));
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
      <Layout
        header={
          <DialogHeader
            title={`Delete ${project.name}?`}
            subtitle="Deleting this project does not delete rooms. Move or delete every room first. This action cannot be undone."
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
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
