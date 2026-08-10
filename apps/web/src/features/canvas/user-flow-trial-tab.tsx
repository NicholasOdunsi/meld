"use client";

import { HStack } from "@astryxdesign/core/HStack";
import { Spinner } from "@astryxdesign/core/Spinner";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useEffect, useState } from "react";
import {
  CanvasSessionError,
  canvasSessionErrorMessage,
  getCanvasGatewayUri,
  requestCanvasSession,
  type CanvasSessionResponse,
} from "./canvas-session";
import { UserFlowTrialCanvas } from "./user-flow-trial-canvas";

export function UserFlowTrialTab({
  organizationId,
  roomId,
  currentUser,
  access,
}: {
  organizationId: string;
  roomId: string;
  currentUser: { id: string; name: string };
  access: "edit" | "view";
}) {
  const [session, setSession] = useState<CanvasSessionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    requestCanvasSession({ organizationId, roomId, signal: controller.signal })
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
  }, [organizationId, roomId]);

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
      <VStack width="100%" height="100%" padding={6} hAlign="center" vAlign="center" gap={2} data-testid="user-flow-trial-loading">
        <Spinner size="sm" label="Connecting to User Flows" />
        <Text type="supporting" color="secondary">Preparing a private trial canvas…</Text>
      </VStack>
    );
  }

  return (
    <VStack width="100%" height="100%" style={{ minHeight: 0 }} data-testid="user-flow-trial-surface">
      <HStack gap={1} padding={1} vAlign="center" style={{ zIndex: 1 }}>
        <StatusDot variant="accent" label="Trial canvas" />
        <Text type="supporting" color="secondary">User Flows trial · changes are shared live</Text>
      </HStack>
      <VStack width="100%" height="100%" style={{ minHeight: 0 }}>
        <UserFlowTrialCanvas
          gatewayUri={getCanvasGatewayUri(session.gatewayUrl, roomId, session.ticket)}
          userId={currentUser.id}
          userName={currentUser.name}
          access={access}
        />
      </VStack>
    </VStack>
  );
}
