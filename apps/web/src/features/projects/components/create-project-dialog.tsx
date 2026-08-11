"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createProject } from "@/features/projects/actions";

const CREATE_PROJECT_ERROR = "We could not create the project.";

export function CreateProjectDialog({
  workspaceId,
  isOpen,
  onOpenChange,
}: {
  workspaceId: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(isOpen);

  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setName("");
      setIsSubmitting(false);
      setError(null);
    }
  }

  async function handleSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length > 120) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await createProject({ workspaceId, name: trimmedName });
      onOpenChange(false);
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : CREATE_PROJECT_ERROR,
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
      <DialogHeader
        title="Create project"
        subtitle="Group related rooms under one outcome."
        onOpenChange={onOpenChange}
      />
      <VStack gap={4} padding={4}>
        {error ? <Banner status="error" title={error} /> : null}
        <VStack gap={2}>
          <Text type="label">Name</Text>
          <TextInput
            label="Name"
            isLabelHidden
            value={name}
            onChange={setName}
            htmlName="name"
            placeholder="Mobile activation"
          />
        </VStack>
        <Button
          label="Create project"
          variant="primary"
          isDisabled={!name.trim() || name.trim().length > 120}
          isLoading={isSubmitting}
          onClick={handleSubmit}
        />
      </VStack>
    </Dialog>
  );
}
