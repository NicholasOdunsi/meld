"use client";

import { Avatar } from "@astryxdesign/core/Avatar";
import { Button } from "@astryxdesign/core/Button";
import { ChatMessage, ChatMessageList } from "@astryxdesign/core/Chat";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { AITaskStatus } from "@meld/contracts";
import { Fragment } from "react";
import { MeldBot } from "@/ui/meld-bot";
import { WaveText } from "@/ui/wave-text";
import type { DesignAgentTurn } from "../design-agent-transcript";

// Same short time format the conversation uses for message timestamps.
const TIME_FORMAT = new Intl.DateTimeFormat("en", { timeStyle: "short" });
function formatTurnTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : TIME_FORMAT.format(date);
}

const ACTIVE_STATUSES: ReadonlySet<AITaskStatus> = new Set<AITaskStatus>([
  "queued",
  "waiting_for_device",
  "ready_to_run",
  "running",
]);
const FAILED_STATUSES: ReadonlySet<AITaskStatus> = new Set<AITaskStatus>([
  "failed",
  "cancelled",
  "needs_reauthentication",
  "usage_limit_reached",
  "needs_review",
]);

// The design agent's purple mascot, sized to sit in a ChatMessage avatar slot
// the same way AgentMarker does for product/research agents in the room.
function DesignAgentAvatar() {
  return (
    <span
      style={{
        display: "inline-flex",
        width: "var(--spacing-9)",
        height: "var(--spacing-9)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <MeldBot variant="design" appearance="head" width={28} height={28} />
    </span>
  );
}

export function AgentsTranscript({
  turns,
  currentUserId,
  currentUserName,
  onPreview,
}: {
  turns: readonly DesignAgentTurn[];
  currentUserId: string;
  currentUserName: string;
  onPreview?: (screenId: string) => void;
}) {
  const askerName = (turn: DesignAgentTurn) =>
    turn.initiatedBy === currentUserId ? currentUserName || "You" : "Teammate";

  return (
    <ChatMessageList
      density="compact"
      gap={3}
      aria-label="Design agent conversation"
      data-testid="agents-transcript"
    >
      {turns.map((turn) => {
        const isActive = ACTIVE_STATUSES.has(turn.taskStatus);
        const isFailed = FAILED_STATUSES.has(turn.taskStatus);
        const isBuilt =
          turn.screenState === "built" && turn.currentVersionId !== null;

        return (
          <Fragment key={turn.taskId}>
            {turn.userPrompt ? (
              <ChatMessage
                sender="assistant"
                avatar={<Avatar name={askerName(turn)} size="md" />}
                data-testid={`agents-turn-prompt-${turn.taskId}`}
              >
                <VStack gap={0.5} width="100%">
                  <HStack gap={2} vAlign="center">
                    <Text type="label">{askerName(turn)}</Text>
                    <Text type="supporting">{formatTurnTime(turn.createdAt)}</Text>
                  </HStack>
                  <Text type="body">{turn.userPrompt}</Text>
                </VStack>
              </ChatMessage>
            ) : null}

            <ChatMessage
              sender="assistant"
              avatar={<DesignAgentAvatar />}
              data-testid={`agents-turn-reply-${turn.taskId}`}
            >
              <VStack gap={0.5} width="100%">
                <HStack gap={2} vAlign="center">
                  <Text type="label">Design Agent</Text>
                  {!isActive ? (
                    <Text type="supporting">{formatTurnTime(turn.createdAt)}</Text>
                  ) : null}
                </HStack>
                {isActive ? (
                  <WaveText
                    text="Designing your screen…"
                    type="body"
                    color="secondary"
                  />
                ) : isFailed ? (
                  <Text type="body" color="secondary">
                    That didn’t come through — try again.
                  </Text>
                ) : isBuilt ? (
                  <VStack gap={1} width="100%">
                    <Text type="body">
                      Built {turn.screenName}
                    </Text>
                    {onPreview ? (
                      <HStack>
                        <Button
                          label={`View ${turn.screenName}`}
                          size="sm"
                          variant="secondary"
                          onClick={() => onPreview(turn.screenId)}
                        >
                          View
                        </Button>
                      </HStack>
                    ) : null}
                  </VStack>
                ) : (
                  <WaveText
                    text="Designing your screen…"
                    type="body"
                    color="secondary"
                  />
                )}
              </VStack>
            </ChatMessage>
          </Fragment>
        );
      })}
    </ChatMessageList>
  );
}
