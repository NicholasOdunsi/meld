"use client";

import { AppShell } from "@astryxdesign/core/AppShell";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Center } from "@astryxdesign/core/Center";
import { Divider } from "@astryxdesign/core/Divider";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { use, useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  requestMagicLink,
  signInWithGoogle,
} from "@/features/auth/actions";
import type { AuthActionState } from "@/features/auth/actions";

const INITIAL_AUTH_ACTION_STATE = {
  status: "idle",
} as const;

function SubmitButton({
  isDisabled,
  label,
  nextPath,
  variant,
}: {
  isDisabled?: boolean;
  label: string;
  nextPath: string;
  variant: "primary" | "secondary";
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      label={label}
      variant={variant}
      width="100%"
      isLoading={pending}
      isDisabled={isDisabled}
      name="next"
      value={nextPath}
    />
  );
}

export function MagicLinkForm({
  state,
  action,
  nextPath,
}: {
  state: AuthActionState;
  action: (payload: FormData) => void;
  nextPath: string;
}) {
  const [email, setEmail] = useState("");
  const linkSent = state.status === "success";

  return (
    <form action={action}>
      <FormLayout>
        <TextInput
          type="email"
          label="Email address"
          value={email}
          onChange={setEmail}
          htmlName="email"
          placeholder="you@example.com"
          isRequired
          isDisabled={linkSent}
          disabledMessage="A sign-in link has already been sent."
          status={
            state.fieldErrors?.email
              ? { type: "error", message: state.fieldErrors.email }
              : undefined
          }
        />
        <SubmitButton
          label={linkSent ? "Sign-in link sent" : "Email me a sign-in link"}
          nextPath={nextPath}
          variant="primary"
          isDisabled={linkSent}
        />
      </FormLayout>
    </form>
  );
}

export default function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string | string[];
    next?: string | string[];
  }>;
}) {
  const parameters = use(searchParams);
  const callbackFailed = parameters.error === "callback";
  const nextPath =
    typeof parameters.next === "string" ? parameters.next : "/";
  const [magicLinkState, magicLinkAction] = useActionState(
    requestMagicLink,
    INITIAL_AUTH_ACTION_STATE,
  );
  const [googleState, googleAction] = useActionState(
    signInWithGoogle,
    INITIAL_AUTH_ACTION_STATE,
  );

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
              <Heading level={1}>Sign in to Meld</Heading>
              <Text type="supporting" display="block">
                Continue with Google or receive a secure sign-in link by email.
              </Text>
            </VStack>

            {magicLinkState.message ? (
              <Banner
                status={
                  magicLinkState.status === "success" ? "success" : "error"
                }
                title={magicLinkState.message}
              />
            ) : null}

            {googleState.message ? (
              <Banner status="error" title={googleState.message} />
            ) : null}

            {callbackFailed ? (
              <Banner
                status="error"
                title="We could not complete sign-in. Please try again."
              />
            ) : null}

            <MagicLinkForm
              state={magicLinkState}
              action={magicLinkAction}
              nextPath={nextPath}
            />

            <Divider label="or" />

            <form action={googleAction}>
              <SubmitButton
                label="Continue with Google"
                nextPath={nextPath}
                variant="secondary"
              />
            </form>
          </VStack>
        </Card>
      </Center>
    </AppShell>
  );
}
