"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { useState } from "react";
import { deleteProject } from "@/features/projects/actions";
import type { ProjectDialogTarget } from "./rename-project-dialog";
import { actionErrorMessage } from "@/ui/action-error";

const DELETE_PROJECT_ERROR = "We could not delete the project.";

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
  ".meld-delete-project-dialog h2 + span { margin-top: var(--spacing-2); display: block; }";

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
      <style>{titleSubtitleGap}</style>
      <VStack
        className="meld-delete-project-dialog"
        style={relaxedSubtitleLineHeight}
      >
        <DialogHeader
          title={`Delete ${project.name}?`}
          subtitle="Deleting this project does not delete rooms. Move or delete every room first. This action cannot be undone."
        />
      </VStack>
      <VStack gap={4} padding={4}>
        {error ? <Banner status="error" title={error} /> : null}
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
