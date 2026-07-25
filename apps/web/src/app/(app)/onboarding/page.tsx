"use client";

import { AppShell } from "@astryxdesign/core/AppShell";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Center } from "@astryxdesign/core/Center";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import Image from "next/image";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createOrganizationFromForm,
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
  const [productName, setProductName] = useState("");
  const [state, action] = useActionState(
    createOrganizationFromForm,
    INITIAL_STATE,
  );

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
                Create your product workspace.
              </Heading>
              <Text
                type="large"
                color="secondary"
                display="block"
                justify="center"
                textWrap="balance"
              >
                Set up your organization and first product
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

          <form action={action}>
            <FormLayout>
              <TextInput
                label="Organization name"
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
              <TextInput
                label="First product"
                size="lg"
                value={productName}
                onChange={setProductName}
                htmlName="productName"
                placeholder="Mobile app"
                status={
                  state.fieldErrors?.productName
                    ? {
                        type: "error",
                        message: state.fieldErrors.productName,
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
