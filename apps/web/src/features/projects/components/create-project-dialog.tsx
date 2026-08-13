"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import {
  Layout,
  LayoutContent,
  LayoutFooter,
} from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { useState } from "react";
import { createProject } from "@/features/projects/actions";
import {
  PROJECT_COLOR_LABELS,
  PROJECT_COLOR_VARS,
  PROJECT_ICON_COMPONENTS,
  PROJECT_ICON_LABELS,
} from "@/features/projects/project-icons";
import {
  DEFAULT_PROJECT_COLOR,
  DEFAULT_PROJECT_ICON,
  PROJECT_COLOR_OPTIONS,
  PROJECT_ICON_OPTIONS,
  type ProjectColor,
  type ProjectIcon,
} from "@/features/projects/schemas";
import { actionErrorMessage } from "@/ui/action-error";

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
  const [icon, setIcon] = useState<ProjectIcon>(DEFAULT_PROJECT_ICON);
  const [color, setColor] = useState<ProjectColor>(DEFAULT_PROJECT_COLOR);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(isOpen);

  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setName("");
      setIcon(DEFAULT_PROJECT_ICON);
      setColor(DEFAULT_PROJECT_COLOR);
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
      // The action returns its outcome: a message thrown out of a Server
      // Action is redacted by Next in a production build, so reading
      // `submitError.message` showed Next's placeholder to real users while
      // the tests, mocking a rejection, saw the friendly string.
      const result = await createProject({
        workspaceId,
        name: trimmedName,
        icon,
        color,
      });
      if (result.status === "error") {
        setError(result.message);
        setIsSubmitting(false);
        return;
      }
      onOpenChange(false);
      router.refresh();
    } catch (submitError) {
      // Last resort only -- a transport failure, not a refusal the action
      // reported.
      setError(actionErrorMessage(submitError, CREATE_PROJECT_ERROR));
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
          <DialogHeader
            title="Create project"
            subtitle="Group related rooms under one outcome."
            onOpenChange={onOpenChange}
            hasDivider
          />
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
                  placeholder="Mobile activation"
                />
              </VStack>
              <VStack gap={2}>
                <Text type="label">Icon</Text>
                <HStack gap={1} wrap="wrap">
                  {PROJECT_ICON_OPTIONS.map((option) => {
                    const OptionIcon = PROJECT_ICON_COMPONENTS[option];
                    const isSelected = option === icon;
                    return (
                      <IconButton
                        key={option}
                        label={PROJECT_ICON_LABELS[option]}
                        tooltip={PROJECT_ICON_LABELS[option]}
                        icon={
                          <OptionIcon
                            pack="filled"
                            size="sm"
                            fill={
                              isSelected
                                ? PROJECT_COLOR_VARS[color]
                                : "var(--color-icon-secondary)"
                            }
                            aria-hidden="true"
                          />
                        }
                        variant={isSelected ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => setIcon(option)}
                      />
                    );
                  })}
                </HStack>
              </VStack>
              <VStack gap={2}>
                <Text type="label">Color</Text>
                <HStack gap={1} wrap="wrap">
                  {PROJECT_COLOR_OPTIONS.map((option) => {
                    const isSelected = option === color;
                    return (
                      <button
                        key={option}
                        type="button"
                        aria-label={PROJECT_COLOR_LABELS[option]}
                        aria-pressed={isSelected}
                        onClick={() => setColor(option)}
                        style={
                          {
                            backgroundColor: PROJECT_COLOR_VARS[option],
                            border: isSelected
                              ? "calc(var(--border-width) * 2) solid var(--color-text-primary)"
                              : "calc(var(--border-width) * 2) solid transparent",
                            borderRadius: "var(--radius-full)",
                            cursor: "pointer",
                            height: "var(--spacing-5)",
                            padding: 0,
                            width: "var(--spacing-5)",
                          } as CSSProperties
                        }
                      />
                    );
                  })}
                </HStack>
              </VStack>
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack hAlign="end">
              <Button
                label="Create project"
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
