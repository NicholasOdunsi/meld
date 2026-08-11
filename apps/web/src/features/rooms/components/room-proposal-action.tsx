"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useCallback, useRef, useState } from "react";
import type { RoomProposedAction } from "@meld/contracts";

// One control for every Product Agent proposal: an explicit command that says
// what confirming will do, and a Dismiss that is durable rather than a local
// "hide it for now". A proposal the participant has already answered is gone
// from their conversation entirely.

const CONFIRM_LABEL: Record<RoomProposedAction["kind"], string> = {
  prd_generate: "Generate PRD",
  prd_revise: "Update PRD",
  user_flow_generate: "Create user flow",
  decision_capture: "Capture decision",
};

export type RoomProposalActionProps = {
  messageId: string;
  action: RoomProposedAction;
  canEdit: boolean;
  response: "accepted" | "dismissed" | null;
  onConfirm: (
    messageId: string,
    action: RoomProposedAction,
  ) => Promise<void>;
  onDismiss: (messageId: string) => Promise<void>;
  // Another proposal in the same conversation is already being answered.
  isBusy?: boolean;
};

export function RoomProposalAction({
  messageId,
  action,
  canEdit,
  response,
  onConfirm,
  onDismiss,
  isBusy = false,
}: RoomProposalActionProps) {
  const [pending, setPending] = useState<"confirm" | "dismiss" | null>(null);
  // A ref, not the state above: a second click can land in the same tick as
  // the first, before the disabled state has rendered.
  const isPendingRef = useRef(false);

  const run = useCallback(
    async (command: "confirm" | "dismiss", work: () => Promise<void>) => {
      if (isPendingRef.current) return;
      isPendingRef.current = true;
      setPending(command);
      try {
        await work();
      } finally {
        isPendingRef.current = false;
        setPending(null);
      }
    },
    [],
  );

  if (response !== null) return null;

  // Generating a user flow writes to the Room, so it needs edit access.
  // Dismissing only ever touches the reader's own view of the proposal.
  const canConfirm = action.kind !== "user_flow_generate" || canEdit;
  const isWaiting = pending !== null || isBusy;

  return (
    <VStack
      gap={1}
      width="100%"
      data-testid={`room-proposal-${messageId}`}
    >
      {action.kind === "decision_capture" ? (
        <Banner
          status="info"
          title="Capture this decision?"
          description={action.summary}
        />
      ) : null}
      {canConfirm ? null : (
        <Text type="supporting" color="secondary">
          Ask someone with edit access to create this user flow.
        </Text>
      )}
      <HStack gap={2} vAlign="center" wrap="wrap">
        {canConfirm ? (
          <Button
            variant="primary"
            size="sm"
            label={CONFIRM_LABEL[action.kind]}
            isLoading={pending === "confirm"}
            isDisabled={isWaiting}
            onClick={() =>
              void run("confirm", () => onConfirm(messageId, action))
            }
          />
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          label="Dismiss"
          isLoading={pending === "dismiss"}
          isDisabled={isWaiting}
          onClick={() => void run("dismiss", () => onDismiss(messageId))}
        />
      </HStack>
    </VStack>
  );
}
