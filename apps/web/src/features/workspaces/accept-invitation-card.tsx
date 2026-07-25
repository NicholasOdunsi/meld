"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useActionState } from "react";
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
      width="100%"
      isLoading={pending}
    />
  );
}

export function AcceptInvitationCard({ token }: { token: string }) {
  const [state, action] = useActionState(
    acceptInvitationFromForm,
    INITIAL_STATE,
  );

  return (
    <Card
      width="100%"
      maxWidth="calc(var(--spacing-12) * 10)"
      padding={8}
    >
      <VStack gap={5}>
        <VStack gap={2}>
          <Heading level={1}>Join a Meld workspace</Heading>
          <Text type="supporting" display="block">
            Accept this single-use invitation with the email address it was
            sent to.
          </Text>
        </VStack>
        {state.message ? (
          <Banner
            status={state.status === "success" ? "success" : "error"}
            title={state.message}
          />
        ) : null}
        {state.status === "success" && state.organizationId ? (
          <Link
            href={`/${state.organizationId}/settings/members`}
            isStandalone
          >
            Open workspace members
          </Link>
        ) : (
          <form action={action}>
            <input type="hidden" name="token" value={token} />
            <AcceptButton />
          </form>
        )}
      </VStack>
    </Card>
  );
}
