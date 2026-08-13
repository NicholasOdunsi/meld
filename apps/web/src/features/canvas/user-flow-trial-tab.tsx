"use client";

import { Spinner } from "@astryxdesign/core/Spinner";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { FlowDocument } from "@meld/contracts";
import { useEffect, useState } from "react";
import { LayoutContent } from "@astryxdesign/core/Layout";
import {
  CanvasSessionError,
  canvasSessionErrorMessage,
  requestCanvasSession,
  type CanvasSessionResponse,
} from "./canvas-session";
import { UserFlowTrialCanvas } from "./user-flow-trial-canvas";
import { UserFlowTrialUnavailable } from "./user-flow-trial-unavailable";
import glowStyles from "./user-flow-generating-glow.module.css";

export type UserFlowTrialTabProps = {
  workspaceId: string;
  roomId: string;
  currentUser: { id: string; name: string };
  trialEnabled: boolean;
  seedFlow?: FlowDocument | null;
  initialGenerationTaskId?: string | null;
  onClientReady?: () => void;
};

export function UserFlowTrialTab({
  workspaceId,
  roomId,
  currentUser,
  trialEnabled,
  seedFlow = null,
  initialGenerationTaskId = null,
  onClientReady,
}: UserFlowTrialTabProps) {
  const [session, setSession] = useState<CanvasSessionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onClientReady?.();
  }, [onClientReady]);

  useEffect(() => {
    if (!trialEnabled) return;
    const controller = new AbortController();
    requestCanvasSession({ workspaceId, roomId, signal: controller.signal })
      .then(setSession)
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          reason instanceof CanvasSessionError
            ? reason.message
            : canvasSessionErrorMessage(500),
        );
      });
    return () => controller.abort();
  }, [trialEnabled, workspaceId, roomId]);

  if (!trialEnabled) {
    return <UserFlowTrialUnavailable />;
  }

  if (error) {
    return (
      <VStack width="100%" height="100%" padding={6} hAlign="center" vAlign="center" gap={2} data-testid="user-flow-trial-error">
        <StatusDot variant="error" label="User flow unavailable" />
        <Text type="label">Unable to open User Flows</Text>
        <Text type="supporting" color="secondary">{error}</Text>
      </VStack>
    );
  }

  if (!session) {
    return (
      <VStack
        width="100%"
        height="100%"
        padding={6}
        hAlign="center"
        vAlign="center"
        gap={2}
        data-testid="user-flow-trial-loading"
        data-generating={Boolean(initialGenerationTaskId)}
        className={initialGenerationTaskId ? glowStyles.glow : undefined}
        style={{ position: "relative", overflow: "hidden" }}
      >
        <Spinner size="sm" label="Connecting to User Flows" />
        <Text type="supporting" color="secondary">Preparing a private trial canvas…</Text>
      </VStack>
    );
  }

  return (
    <LayoutContent
      padding={0}
      data-testid="user-flow-trial-surface"
      style={{ position: "relative", minHeight: "var(--spacing-0)" }}
    >
      <VStack width="100%" height="100%" minHeight="var(--spacing-0)">
        <UserFlowTrialCanvas
          workspaceId={workspaceId}
          roomId={roomId}
          userId={currentUser.id}
          userName={currentUser.name}
          access={session.access}
          trialEnabled={trialEnabled}
          seedFlow={seedFlow}
          initialGenerationTaskId={initialGenerationTaskId}
        />
      </VStack>
    </LayoutContent>
  );
}
