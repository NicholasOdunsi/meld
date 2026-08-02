"use client";

import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { ReactNode } from "react";
import { useRoomTaskStatus } from "./room-task-status-provider";

const GENERATION_STEPS = [
  "Gathered room context",
  "Writing sections",
  "Linking decisions",
  "Finalizing",
] as const;

export function PrdGenerating() {
  return (
    <VStack
      gap={6}
      width="100%"
      height="100%"
      paddingBlock={8}
      paddingInline={6}
      hAlign="center"
      isScrollable
    >
      <VStack gap={6} width="100%" maxWidth="calc(var(--spacing-12) * 15)">
        <VStack gap={2} width="100%">
          <HStack gap={2} vAlign="center">
            <StatusDot
              variant="accent"
              label="PRD generation in progress"
              isPulsing
            />
            <Text type="large">Drafting your PRD…</Text>
          </HStack>
          <Text type="supporting" color="secondary">
            Running on your Codex · reading the room context
          </Text>
        </VStack>

        <VStack gap={2} width="100%">
          {GENERATION_STEPS.map((step, index) => (
            <HStack key={step} gap={2} vAlign="center">
              <StatusDot
                variant={index < 2 ? "accent" : "neutral"}
                label={index < 2 ? `${step} in progress` : `${step} pending`}
                isPulsing={index === 1}
              />
              <Text type="supporting" color="secondary">
                {step}
              </Text>
            </HStack>
          ))}
        </VStack>

        {[0, 1, 2].map((index) => (
          <Card key={index} width="100%" variant="muted" padding={4}>
            <VStack gap={3} width="100%">
              <Skeleton
                width={index === 0 ? "40%" : "32%"}
                height="var(--spacing-4)"
                index={index * 3}
              />
              <Skeleton
                width="100%"
                height="var(--spacing-3)"
                index={index * 3 + 1}
              />
              <Skeleton
                width="72%"
                height="var(--spacing-3)"
                index={index * 3 + 2}
              />
            </VStack>
          </Card>
        ))}
      </VStack>
    </VStack>
  );
}

export function PrdTabContent({
  hasPrd,
  children,
}: {
  hasPrd: boolean;
  children?: ReactNode;
}) {
  const roomTaskStatus = useRoomTaskStatus();
  if (hasPrd && children) return children;
  if (
    roomTaskStatus?.hasPrdGeneration ||
    roomTaskStatus?.isInitialLoading
  ) {
    return <PrdGenerating />;
  }
  return (
    <EmptyState
      title="No PRD yet"
      description="Ask the agent to draft one."
    />
  );
}
