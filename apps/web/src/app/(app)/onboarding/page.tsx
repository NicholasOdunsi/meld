"use client";

import { AppShell } from "@astryxdesign/core/AppShell";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Center } from "@astryxdesign/core/Center";
import { FileInput } from "@astryxdesign/core/FileInput";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import Image from "next/image";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createWorkspaceFromForm,
  type WorkspaceFormState,
} from "@/features/workspaces/actions";

const INITIAL_STATE: WorkspaceFormState = { status: "idle" };

function CreateWorkspaceButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      label="Create workspace"
      variant="primary"
      size="lg"
      width="100%"
      isLoading={pending}
    />
  );
}

function MeldMark() {
  return (
    <Image
      src="/meld-mark.svg"
      alt=""
      width={48}
      height={48}
      priority
    />
  );
}

export default function OnboardingPage() {
  const [name, setName] = useState("");
  const [logo, setLogo] = useState<File | File[] | null>(null);
  const [state, action] = useActionState(
    createWorkspaceFromForm,
    INITIAL_STATE,
  );
  const submitAction = (formData: FormData) => {
    if (logo instanceof File) {
      formData.set("logo", logo);
    }
    action(formData);
  };

  return (
    <AppShell height="auto" variant="wash" contentPadding={4}>
      <Center
        width="100%"
        minHeight="calc(100dvh - var(--spacing-8))"
      >
        <VStack
          gap={6}
          width="100%"
          maxWidth="calc(var(--spacing-12) * 9)"
        >
          <VStack gap={4} hAlign="center">
            <MeldMark />
            <VStack gap={1} hAlign="center">
              <Heading
                level={1}
                type="display-3"
                justify="center"
                textWrap="balance"
              >
                Create your workspace.
              </Heading>
              <Text
                type="large"
                color="secondary"
                display="block"
                justify="center"
                textWrap="balance"
              >
                Add your workspace name and logo
              </Text>
            </VStack>
          </VStack>

          {state.message ? (
            <Banner
              status={
                state.status === "success" ? "success" : "error"
              }
              title={state.message}
            />
          ) : null}

          <form action={submitAction}>
            <FormLayout>
              <TextInput
                label="Workspace name"
                size="lg"
                value={name}
                onChange={setName}
                htmlName="name"
                placeholder="Northstar"
                status={
                  state.fieldErrors?.name
                    ? {
                        type: "error",
                        message: state.fieldErrors.name,
                      }
                    : undefined
                }
              />
              <FileInput
                label="Workspace logo"
                value={logo}
                onChange={setLogo}
                mode="dropzone"
                accept="image/png,image/jpeg,image/webp"
                maxSize={2 * 1024 * 1024}
                placeholder="PNG, JPEG, or WebP up to 2 MB"
                width="100%"
                status={
                  state.fieldErrors?.logo
                    ? {
                        type: "error",
                        message: state.fieldErrors.logo,
                      }
                    : undefined
                }
              />
              <CreateWorkspaceButton />
            </FormLayout>
          </form>
        </VStack>
      </Center>
    </AppShell>
  );
}
