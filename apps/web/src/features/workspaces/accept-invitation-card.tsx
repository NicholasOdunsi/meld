"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import {
  acceptInvitationFromForm,
  type WorkspaceFormState,
} from "./actions";

const INITIAL_STATE: WorkspaceFormState = { status: "idle" };

function AcceptButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      label="Accept invitation"
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

export function AcceptInvitationCard({ token }: { token: string }) {
  const router = useRouter();
  const [state, action] = useActionState(
    acceptInvitationFromForm,
    INITIAL_STATE,
  );

  useEffect(() => {
    if (state.status === "success" && state.workspaceId) {
      router.push(`/${state.workspaceId}`);
    }
  }, [state.status, state.workspaceId, router]);

  return (
    <VStack gap={6} width="100%" maxWidth="calc(var(--spacing-12) * 9)">
      <VStack gap={4} hAlign="center">
        <MeldMark />
        <VStack gap={1} hAlign="center">
          <Heading
            level={1}
            type="display-3"
            justify="center"
            textWrap="balance"
          >
            Join a Meld workspace.
          </Heading>
          <Text
            type="large"
            color="secondary"
            display="block"
            justify="center"
            textWrap="balance"
          >
            Accept this single-use invitation with the email address it was
            sent to.
          </Text>
        </VStack>
      </VStack>

      {state.message ? (
        <Banner
          status={state.status === "success" ? "success" : "error"}
          title={state.message}
        />
      ) : null}
      {state.status !== "success" ? (
        <form action={action}>
          <input type="hidden" name="token" value={token} />
          <AcceptButton />
        </form>
      ) : null}
    </VStack>
  );
}
