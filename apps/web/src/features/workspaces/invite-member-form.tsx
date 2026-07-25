"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Heading } from "@astryxdesign/core/Heading";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  inviteMemberFromForm,
  retryInvitationDeliveryFromForm,
  type WorkspaceFormState,
} from "./actions";

const INITIAL_STATE: WorkspaceFormState = { status: "idle" };

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      label={label}
      variant={label === "Send invitation" ? "primary" : "secondary"}
      isLoading={pending}
    />
  );
}

function RetryDeliveryForm({
  invitationId,
  organizationId,
}: {
  invitationId: string;
  organizationId: string;
}) {
  const router = useRouter();
  const [state, action] = useActionState(
    retryInvitationDeliveryFromForm,
    INITIAL_STATE,
  );

  useEffect(() => {
    if (state.status !== "idle") {
      router.refresh();
    }
  }, [router, state.status]);

  return (
    <VStack gap={2}>
      {state.message ? (
        <Banner
          status={state.status === "success" ? "success" : "error"}
          title={state.message}
        />
      ) : null}
      <form action={action}>
        <input
          type="hidden"
          name="organizationId"
          value={organizationId}
        />
        <input
          type="hidden"
          name="invitationId"
          value={invitationId}
        />
        <SubmitButton label="Retry delivery" />
      </form>
    </VStack>
  );
}

export function InviteMemberForm({
  organizationId,
}: {
  organizationId: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [state, action] = useActionState(
    inviteMemberFromForm,
    INITIAL_STATE,
  );

  useEffect(() => {
    if (state.invitationId) {
      router.refresh();
    }
  }, [router, state.invitationId]);

  return (
    <Card padding={5}>
      <VStack gap={4}>
        <Heading level={3}>Invite a teammate</Heading>
        {state.message ? (
          <Banner
            status={state.status === "success" ? "success" : "error"}
            title={state.message}
          />
        ) : null}
        <form action={action}>
          <FormLayout direction="horizontal">
            <input
              type="hidden"
              name="organizationId"
              value={organizationId}
            />
            <TextInput
              type="email"
              label="Email address"
              value={email}
              onChange={setEmail}
              htmlName="email"
              placeholder="teammate@example.com"
              isRequired
              status={
                state.fieldErrors?.email
                  ? {
                      type: "error",
                      message: state.fieldErrors.email,
                    }
                  : undefined
              }
            />
            <SubmitButton label="Send invitation" />
          </FormLayout>
        </form>
        {state.retryable &&
        state.organizationId &&
        state.invitationId ? (
          <RetryDeliveryForm
            organizationId={state.organizationId}
            invitationId={state.invitationId}
          />
        ) : null}
      </VStack>
    </Card>
  );
}
