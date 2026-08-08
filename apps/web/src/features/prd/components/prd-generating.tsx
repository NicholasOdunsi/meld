"use client";

import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { VStack } from "@astryxdesign/core/VStack";
import type { Provider } from "@meld/contracts";
import { useRouter } from "next/navigation";
import { useCallback, useRef, type ReactNode } from "react";
import { AgentActivity } from "@/features/ai/components/agent-activity";
import { AgentTaskState } from "@/features/ai/components/agent-task-state";
import {
  generatePrd,
  type GeneratePrdResult,
} from "../actions";
import { useRoomTaskStatus } from "./room-task-status-provider";

export function PrdGenerating() {
  const roomTaskStatus = useRoomTaskStatus();

  const latestPrdTask = roomTaskStatus?.latestPrdTask;

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
        {/* Before the first status poll lands there is no task row yet, so
            neither the provider nor a start time is known. AgentActivity
            omits both rather than guessing. */}
        <AgentActivity
          status={latestPrdTask?.status ?? "queued"}
          provider={latestPrdTask?.provider}
          startedAt={latestPrdTask?.createdAt}
          kind="prd_generate"
          size="hero"
        />

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
  roomId,
  organizationId,
  basePath,
  generatePrdAction = generatePrd,
}: {
  hasPrd: boolean;
  children?: ReactNode;
  roomId?: string;
  organizationId?: string;
  basePath?: string;
  generatePrdAction?: (input: {
    roomId: string;
    provider?: Provider;
  }) => Promise<GeneratePrdResult>;
}) {
  const router = useRouter();
  const roomTaskStatus = useRoomTaskStatus();
  const retryInFlight = useRef(false);
  const retryPrd = useCallback(async () => {
    const task = roomTaskStatus?.latestPrdTask;
    if (!roomId || !task || retryInFlight.current) return;
    retryInFlight.current = true;
    try {
      const result = await generatePrdAction({
        roomId,
        provider: task.provider,
      });
      if (result.status === "queued") {
        roomTaskStatus.notifyQueued({
          kind: "prd_generate",
          taskId: result.taskId,
        });
      }
    } finally {
      retryInFlight.current = false;
    }
  }, [generatePrdAction, roomId, roomTaskStatus]);
  const fixConnection = useCallback(() => {
    if (!organizationId || !basePath) return;
    router.push(
      `/${organizationId}/settings/devices?returnTo=${encodeURIComponent(
        `${basePath}?tab=prd`,
      )}`,
    );
  }, [basePath, organizationId, router]);

  if (hasPrd && children) return children;
  if (
    roomTaskStatus?.hasPrdGeneration ||
    roomTaskStatus?.isInitialLoading
  ) {
    return <PrdGenerating />;
  }
  const latestTask = roomTaskStatus?.latestPrdTask;
  if (
    latestTask?.status === "failed" ||
    latestTask?.status === "needs_reauthentication" ||
    latestTask?.status === "usage_limit_reached" ||
    latestTask?.status === "needs_review"
  ) {
    return (
      <VStack width="100%" padding={6}>
        <AgentTaskState
          taskKind="prd_generate"
          status={latestTask.status}
          provider={latestTask.provider}
          onFixConnection={fixConnection}
          onRetry={() => void retryPrd()}
        />
      </VStack>
    );
  }
  return (
    <EmptyState
      title="No PRD yet"
      description="Ask the agent to draft one."
    />
  );
}
