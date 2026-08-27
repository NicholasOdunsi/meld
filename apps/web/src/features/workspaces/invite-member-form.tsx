"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  inviteMemberFromForm,
  retryInvitationDeliveryFromForm,
  type WorkspaceFormState,
} from "./actions";
import { PRODUCT_ROLES } from "./product-roles";
import { MeldBanner } from "@/ui/meld/banner";
import { MeldButton } from "@/ui/meld/button";
import { MeldSelect } from "@/ui/meld/select";
import { MeldTextInput } from "@/ui/meld/text-input";
import {
  MeldCard,
  MeldControlRow,
  MeldSectionHeading,
  MeldStack,
} from "@/ui/meld/stack";

const INITIAL_STATE: WorkspaceFormState = { status: "idle" };
const PRODUCT_ROLE_OPTIONS = PRODUCT_ROLES.map((role) => ({
  value: role.value,
  label: role.label,
}));
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
    <MeldButton
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
  workspaceId,
}: {
  invitationId: string;
  workspaceId: string;
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
    <MeldStack gap={2}>
      {state.message ? (
        <MeldBanner
          status={state.status === "success" ? "success" : "error"}
          title={state.message}
        />
      ) : null}
      <form action={action}>
        <input
          type="hidden"
          name="workspaceId"
          value={workspaceId}
        />
        <input
          type="hidden"
          name="invitationId"
          value={invitationId}
        />
        <SubmitButton label="Retry delivery" />
      </form>
    </MeldStack>
  );
}

function InviteEmailForm({
  action,
  emailError,
  workspaceId,
  presentation,
  productRoleError,
}: {
  action: (payload: FormData) => void;
  emailError?: string;
  workspaceId: string;
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
        name="workspaceId"
        value={workspaceId}
      />
      {/* The email field flexes; role and submit keep their natural width. On
          narrow viewports the row wraps rather than crushing the select. */}
      <MeldControlRow>
        <MeldTextInput
            type="email"
            label="Email address"
            hideLabel={presentation === "onboarding"}
            inputSize={size}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            name="email"
            placeholder="name@company.com"
            required={presentation === "settings"}
          errorMessage={emailError}
        />
        <MeldSelect
            label="Role"
            hideLabel={presentation === "onboarding"}
            selectSize={size}
            options={PRODUCT_ROLE_OPTIONS}
            value={productRole}
            onChange={(event) => setProductRole(event.target.value)}
            name="productRole"
            placeholder="Role"
          errorMessage={productRoleError}
        />
        {/* Secondary, not primary: on the onboarding step the primary weight
            belongs to "Done", and two accent-filled buttons on one screen
            compete for the same attention. */}
        <SubmitButton label="Send invite" variant="secondary" size={size} />
      </MeldControlRow>
    </form>
  );
}

export function InviteMemberForm({
  workspaceId,
  presentation = "settings",
}: {
  workspaceId: string;
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
    <MeldStack gap={4}>
      {presentation === "settings" ? (
        <MeldSectionHeading>Invite a teammate</MeldSectionHeading>
      ) : null}
      {state.message ? (
        <MeldBanner
          status={state.status === "success" ? "success" : "error"}
          title={state.message}
        />
      ) : null}
      <InviteEmailForm
        key={state.invitationId ?? "initial"}
        action={action}
        emailError={state.fieldErrors?.email}
        workspaceId={workspaceId}
        presentation={presentation}
        productRoleError={state.fieldErrors?.productRole}
      />
      {state.retryable &&
      state.workspaceId &&
      state.invitationId ? (
        <RetryDeliveryForm
          workspaceId={state.workspaceId}
          invitationId={state.invitationId}
        />
      ) : null}
    </MeldStack>
  );

  return presentation === "settings" ? <MeldCard>{content}</MeldCard> : content;
}
