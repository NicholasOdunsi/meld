"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { ProviderSetupStatus } from "@meld/contracts";
import type { ProviderSetupView } from "../provider-setup-service";
import { providerLabel } from "./use-pairing-code";

const TERMINAL_STATUSES: ReadonlySet<ProviderSetupStatus> = new Set([
  "completed",
  "failed",
  "cancelled",
]);

export function isTerminalSetupStatus(status: ProviderSetupStatus) {
  return TERMINAL_STATUSES.has(status);
}

// Copy is driven only by the durable server status, never by an optimistic
// local guess: the connector's real progress is the single source of truth.
export const STATUS_LABEL: Record<ProviderSetupStatus, string> = {
  queued: "Waiting for your Mac",
  dispatched: "Waiting for your Mac",
  installing: "Installing",
  authenticating: "Authenticating",
  verifying: "Verifying",
  completed: "Ready",
  failed: "Setup failed",
  cancelled: "Setup cancelled",
};

export const STATUS_VARIANT: Record<
  ProviderSetupStatus,
  "success" | "warning" | "error" | "accent" | "neutral"
> = {
  queued: "neutral",
  dispatched: "neutral",
  installing: "accent",
  authenticating: "accent",
  verifying: "accent",
  completed: "success",
  failed: "error",
  cancelled: "warning",
};

// Shared between the onboarding AIConnectionSetup and the settings
// ConnectDevice screens so the two render the same durable setup state from the
// same source and can never drift apart. onContinue is optional: settings has
// no next step to route to, so it omits the Continue button.
export function SetupProgress({
  setup,
  onContinue,
  onRetry,
  isRetrying,
}: {
  setup: ProviderSetupView;
  onContinue?: () => void;
  onRetry: () => void;
  isRetrying: boolean;
}) {
  const label = STATUS_LABEL[setup.status];
  const variant = STATUS_VARIANT[setup.status];
  const isReady = setup.status === "completed";
  const isFailed = setup.status === "failed";

  return (
    <VStack gap={4} data-testid="setup-progress">
      <VStack gap={2}>
        <Text type="label">Setting up {providerLabel(setup.provider)}</Text>
        <HStack gap={2} vAlign="center">
          <StatusDot
            variant={variant}
            label={label}
            isPulsing={!isTerminalSetupStatus(setup.status)}
          />
          <Text type="body" weight="medium">
            {label}
          </Text>
        </HStack>
        {setup.progressMessage && !isFailed ? (
          <Text type="supporting" color="secondary">
            {setup.progressMessage}
          </Text>
        ) : null}
      </VStack>

      {isFailed ? (
        <Banner
          status="error"
          title="Setup did not complete"
          description={
            setup.errorMessage ?? "Something interrupted setup on your Mac."
          }
        />
      ) : null}

      {isReady ? (
        <Banner
          status="success"
          title={`${providerLabel(setup.provider)} is ready`}
          description="Your Mac can now run the Product Agent."
        />
      ) : null}

      <HStack gap={2}>
        {isReady && onContinue ? (
          <Button
            label="Continue"
            variant="primary"
            size="lg"
            onClick={onContinue}
          />
        ) : null}
        {isFailed ? (
          <Button
            label="Try again"
            variant="primary"
            size="lg"
            isLoading={isRetrying}
            onClick={onRetry}
          />
        ) : null}
      </HStack>
    </VStack>
  );
}
