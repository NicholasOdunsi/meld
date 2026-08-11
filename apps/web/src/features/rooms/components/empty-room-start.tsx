"use client";

import { Icon } from "@astryxdesign/core/Icon";
import { List, ListItem } from "@astryxdesign/core/List";
import { Text } from "@astryxdesign/core/Text";
import { useToast } from "@astryxdesign/core/Toast";
import { File } from "@boxicons/react/File";
import { GitBranch } from "@boxicons/react/GitBranch";
import { MessageCircle } from "@boxicons/react/MessageCircle";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { startUserFlow } from "@/features/canvas/user-flow-lifecycle";

const START_ERROR = "We could not start that user flow.";

function focusComposer() {
  const composer = document.querySelector<HTMLElement>(
    '[data-testid="room-chat-composer"] [contenteditable="true"]',
  ) ??
    document.querySelector<HTMLElement>('[aria-label="Message"]');
  composer?.focus();
}

function openMeetingNotesPath() {
  const fileInput = document.querySelector<HTMLInputElement>(
    'input[type="file"][aria-label="Add files or images"]',
  );
  fileInput?.click();
  focusComposer();
}

export function EmptyRoomStart({
  roomId,
  basePath,
  canEdit,
}: {
  roomId: string;
  basePath: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [isStartingFlow, setIsStartingFlow] = useState(false);

  if (!canEdit) return null;

  async function handleStartUserFlow() {
    if (isStartingFlow) return;
    setIsStartingFlow(true);
    try {
      await startUserFlow(roomId);
      router.push(`${basePath}?tab=user-flows`);
    } catch {
      toast({ type: "error", body: START_ERROR });
      setIsStartingFlow(false);
    }
  }

  return (
    <List
      density="balanced"
      hasDividers
      header={<Text type="label">Choose a starting point</Text>}
      data-testid="empty-room-start"
    >
      <ListItem
        label="Paste meeting notes"
        description="Add notes or a document to the conversation"
        startContent={<Icon icon={File} size="sm" />}
        onClick={openMeetingNotesPath}
      />
      <ListItem
        label="Start a user flow"
        description="Map the experience on a shared canvas"
        startContent={<Icon icon={GitBranch} size="sm" />}
        isDisabled={isStartingFlow}
        onClick={() => void handleStartUserFlow()}
      />
      <ListItem
        label="Just start talking"
        description="Share an observation or ask a question"
        startContent={<Icon icon={MessageCircle} size="sm" />}
        onClick={focusComposer}
      />
    </List>
  );
}
