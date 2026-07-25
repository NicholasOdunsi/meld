"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Selector } from "@astryxdesign/core/Selector";
import { StackItem } from "@astryxdesign/core/Stack";
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
import { PRODUCT_ROLES } from "./product-roles";

const INITIAL_STATE: WorkspaceFormState = { status: "idle" };
const PRODUCT_ROLE_OPTIONS = PRODUCT_ROLES.map((role) => ({
  value: role.value,
  label: role.label,
}));
// Wide enough for the longest product role label on one line.
const ROLE_FIELD_WIDTH = "calc(var(--spacing-12) * 3.5)";

function SubmitButton({
  label,
  variant = "secondary",
  size = "md",
}: {
  label: string;
  variant?: "primary" | "secondary";
  size?: "md" | "lg";
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      label={label}
      variant={variant}
      size={size}
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

function InviteEmailForm({
  action,
  emailError,
  organizationId,
  presentation,
  productRoleError,
}: {
  action: (payload: FormData) => void;
  emailError?: string;
  organizationId: string;
  presentation: "settings" | "onboarding";
  productRoleError?: string;
}) {
  const [email, setEmail] = useState("");
  const [productRole, setProductRole] = useState("");
  const size = presentation === "onboarding" ? "lg" : "md";

  return (
    <form action={action}>
      <input
        type="hidden"
        name="organizationId"
        value={organizationId}
      />
      <HStack gap={2} vAlign="end">
        <StackItem size="fill">
          <TextInput
            type="email"
            label="Email address"
            isLabelHidden={presentation === "onboarding"}
            size={size}
            width="100%"
            value={email}
            onChange={setEmail}
            htmlName="email"
            placeholder="name@company.com"
            isRequired={presentation === "settings"}
            status={emailError ? { type: "error" } : undefined}
          />
        </StackItem>
        <Selector
          label="Role"
          isLabelHidden={presentation === "onboarding"}
          size={size}
          width={ROLE_FIELD_WIDTH}
          options={PRODUCT_ROLE_OPTIONS}
          value={productRole}
          onChange={setProductRole}
          htmlName="productRole"
          placeholder="Role"
          status={productRoleError ? { type: "error" } : undefined}
        />
        <SubmitButton
          label="Send invite"
          variant="primary"
          size={size}
        />
      </HStack>
    </form>
  );
}

export function InviteMemberForm({
  organizationId,
  presentation = "settings",
}: {
  organizationId: string;
  presentation?: "settings" | "onboarding";
}) {
  const router = useRouter();
  const [state, action] = useActionState(
    inviteMemberFromForm,
    INITIAL_STATE,
  );

  useEffect(() => {
    if (state.invitationId) {
      router.refresh();
    }
  }, [router, state.invitationId]);

  const content = (
    <VStack gap={4}>
      {presentation === "settings" ? (
        <Heading level={3}>Invite a teammate</Heading>
      ) : null}
      {state.message ? (
        <Banner
          status={state.status === "success" ? "success" : "error"}
          title={state.message}
        />
      ) : null}
      <InviteEmailForm
        key={state.invitationId ?? "initial"}
        action={action}
        emailError={state.fieldErrors?.email}
        organizationId={organizationId}
        presentation={presentation}
        productRoleError={state.fieldErrors?.productRole}
      />
      {state.retryable &&
      state.organizationId &&
      state.invitationId ? (
        <RetryDeliveryForm
          organizationId={state.organizationId}
          invitationId={state.invitationId}
        />
      ) : null}
    </VStack>
  );

  return presentation === "settings" ? (
    <Card padding={5}>{content}</Card>
  ) : (
    content
  );
}
