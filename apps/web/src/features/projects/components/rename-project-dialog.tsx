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
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { renameProject } from "@/features/projects/actions";
import { actionErrorMessage } from "@/ui/action-error";

const RENAME_PROJECT_ERROR = "We could not rename the project.";

export type ProjectDialogTarget = {
  id: string;
  name: string;
};

export function RenameProjectDialog({
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
  const [name, setName] = useState(project.name);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openProjectId, setOpenProjectId] = useState(
    isOpen ? project.id : null,
  );

  if (isOpen && openProjectId !== project.id) {
    setOpenProjectId(project.id);
    setName(project.name);
    setIsSubmitting(false);
    setError(null);
  } else if (!isOpen && openProjectId !== null) {
    setOpenProjectId(null);
  }

  async function handleSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length > 120) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const result = await renameProject({
        workspaceId,
        projectId: project.id,
        name: trimmedName,
      });
      if (result.status === "error") {
        setError(result.message);
        setIsSubmitting(false);
        return;
      }
      onOpenChange(false);
      router.refresh();
    } catch (submitError) {
      setError(actionErrorMessage(submitError, RENAME_PROJECT_ERROR));
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
      <Layout
        header={
          <DialogHeader title="Rename project" onOpenChange={onOpenChange} />
        }
        content={
          <LayoutContent>
            <VStack gap={4}>
              {error ? <Banner status="error" title={error} /> : null}
              <VStack gap={2}>
                <Text type="label">Name</Text>
                <TextInput
                  label="Name"
                  isLabelHidden
                  value={name}
                  onChange={setName}
                  htmlName="name"
                />
              </VStack>
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack hAlign="end">
              <Button
                label="Save changes"
                variant="primary"
                isDisabled={!name.trim() || name.trim().length > 120}
                isLoading={isSubmitting}
                onClick={handleSubmit}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
