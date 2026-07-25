"use client";

import { AppShell } from "@astryxdesign/core/AppShell";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Center } from "@astryxdesign/core/Center";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
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
      width="100%"
      isLoading={pending}
    />
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [productName, setProductName] = useState("");
  const [state, action] = useActionState(
    createOrganizationFromForm,
    INITIAL_STATE,
  );

  useEffect(() => {
    if (state.status === "success" && state.organizationId) {
      router.push(`/${state.organizationId}/settings/members`);
    }
  }, [router, state.organizationId, state.status]);

  return (
    <AppShell height="fill" variant="wash" contentPadding={4}>
      <Center width="100%" height="100%">
        <Card
          width="100%"
          maxWidth="calc(var(--spacing-12) * 10)"
          padding={8}
        >
          <VStack gap={5}>
            <VStack gap={2}>
              <Heading level={1}>Create your Meld workspace</Heading>
              <Text type="supporting" display="block">
                Name the organization and the first product your team will
                shape together.
              </Text>
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
                  value={name}
                  onChange={setName}
                  htmlName="name"
                  placeholder="Northstar"
                  isRequired
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
                  value={productName}
                  onChange={setProductName}
                  htmlName="productName"
                  placeholder="Mobile app"
                  isRequired
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
        </Card>
      </Center>
    </AppShell>
  );
}
