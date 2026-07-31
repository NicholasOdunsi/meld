"use client";

import { AppShell } from "@astryxdesign/core/AppShell";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Center } from "@astryxdesign/core/Center";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { Provider, ProviderSetupStatus } from "@meld/contracts";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ProviderSetupView,
  parseProviderSetupView,
} from "../provider-setup-service";
import {
  PAIRING_COMMAND,
  providerLabel,
  usePairingCode,
} from "./use-pairing-code";

export type AIConnectionDevice = {
  id: string;
  name: string;
};

const POLL_INTERVAL_MS = 2000;

const TERMINAL_STATUSES: ReadonlySet<ProviderSetupStatus> = new Set([
  "completed",
  "failed",
  "cancelled",
]);

function isTerminal(status: ProviderSetupStatus) {
  return TERMINAL_STATUSES.has(status);
}

// Copy is driven only by the durable server status, never by an optimistic
// local guess: the connector's real progress is the single source of truth.
const STATUS_LABEL: Record<ProviderSetupStatus, string> = {
  queued: "Waiting for your Mac",
  dispatched: "Waiting for your Mac",
  installing: "Installing",
  authenticating: "Authenticating",
  verifying: "Verifying",
  completed: "Ready",
  failed: "Setup failed",
  cancelled: "Setup cancelled",
};

const STATUS_VARIANT: Record<
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

const CREATE_ERROR =
  "We could not start setup on this Mac. Please try again.";

function MeldMark() {
  return (
    <Image src="/meld-mark.svg" alt="" width={48} height={48} priority />
  );
}

export function AIConnectionSetup({
  organizationId,
  devices,
  initialSetup = null,
  fakePairingCode,
}: {
  organizationId: string;
  devices: AIConnectionDevice[];
  initialSetup?: ProviderSetupView | null;
  fakePairingCode?: string;
}) {
  const router = useRouter();
  const pairing = usePairingCode(fakePairingCode);
  const [setup, setSetup] = useState<ProviderSetupView | null>(initialSetup);
  const [creatingProvider, setCreatingProvider] = useState<Provider | null>(
    null,
  );
  const [createError, setCreateError] = useState<string | null>(null);

  // A late-resolving fetch must not setState on an unmounted component; every
  // async write below is gated on this, and the poll fetches are aborted too.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const activeDevice = devices.at(0) ?? null;
  const hasDevice = activeDevice !== null;
  const selectedProvider = pairing.selectedProvider;

  const continueToSetup = () =>
    router.push(`/onboarding/${organizationId}/setup`);

  const createSetup = useCallback(
    async (deviceId: string, provider: Provider) => {
      setCreatingProvider(provider);
      setCreateError(null);
      try {
        const response = await fetch("/api/devices/provider-setups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId, provider }),
        });
        if (!response.ok) {
          throw new Error("create failed");
        }
        const next = parseProviderSetupView(await response.json());
        if (!mountedRef.current) {
          return;
        }
        // Only the durable view the server returned is stored — the UI never
        // fabricates an in-progress stage locally.
        setSetup(next);
      } catch {
        if (mountedRef.current) {
          setCreateError(CREATE_ERROR);
        }
      } finally {
        if (mountedRef.current) {
          setCreatingProvider(null);
        }
      }
    },
    [],
  );

  const requestId = setup?.id ?? null;
  const status = setup?.status ?? null;

  const poll = useCallback(async (id: string, signal: AbortSignal) => {
    try {
      const response = await fetch(`/api/devices/provider-setups/${id}`, {
        signal,
      });
      if (!response.ok) {
        return;
      }
      const next = parseProviderSetupView(await response.json());
      if (!signal.aborted && mountedRef.current) {
        setSetup(next);
      }
    } catch {
      // A dropped or aborted poll simply retries on the next tick; the last
      // durable snapshot stays on screen.
    }
  }, []);

  // Per-request progress poll: runs once a request id is known and stops on
  // terminal status, on unmount (interval cleared, in-flight fetch aborted).
  useEffect(() => {
    if (requestId === null || status === null || isTerminal(status)) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      void poll(requestId, controller.signal);
    }, POLL_INTERVAL_MS);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [poll, requestId, status]);

  const discover = useCallback(
    async (provider: Provider, signal: AbortSignal) => {
      try {
        const response = await fetch("/api/devices/provider-setups", {
          signal,
        });
        if (!response.ok) {
          return;
        }
        const body: unknown = await response.json();
        const rows = Array.isArray(body) ? body : [];
        // Newest-first from the server; adopt the first live setup for the
        // provider the user selected. Durable state only: the row itself, no
        // synthesised stage.
        for (const raw of rows) {
          let view: ProviderSetupView;
          try {
            view = parseProviderSetupView(raw);
          } catch {
            continue;
          }
          if (view.provider === provider && !isTerminal(view.status)) {
            if (!signal.aborted && mountedRef.current) {
              setSetup(view);
            }
            return;
          }
        }
      } catch {
        // Retries on the next tick; the pairing command stays on screen.
      }
    },
    [],
  );

  // First-pair discovery: pairing creates the setup row server-side but the
  // browser never learns its id, so poll the list until a live setup for the
  // selected provider appears, then hand off to the per-request poll above.
  const shouldDiscover =
    !hasDevice && selectedProvider !== null && setup === null;
  useEffect(() => {
    if (!shouldDiscover || selectedProvider === null) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      void discover(selectedProvider, controller.signal);
    }, POLL_INTERVAL_MS);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [discover, shouldDiscover, selectedProvider]);

  function onProviderClick(provider: Provider) {
    if (activeDevice) {
      void createSetup(activeDevice.id, provider);
      return;
    }
    void pairing.generatePairingCode(provider);
  }

  const showProgress = setup !== null && setup.status !== "cancelled";

  return (
    <AppShell height="auto" variant="wash" contentPadding={4}>
      <Center width="100%" minHeight="calc(100dvh - var(--spacing-8))">
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
                Connect your AI.
              </Heading>
              <Text
                type="large"
                color="secondary"
                display="block"
                justify="center"
                textWrap="balance"
              >
                Run Codex or Claude on your Mac so the Product Agent can
                reply in your rooms.
              </Text>
            </VStack>
          </VStack>

          {showProgress && setup ? (
            <SetupProgress
              setup={setup}
              onContinue={continueToSetup}
              onRetry={() => {
                if (activeDevice) {
                  void createSetup(activeDevice.id, setup.provider);
                }
              }}
              isRetrying={creatingProvider !== null}
            />
          ) : (
            <VStack gap={6}>
              <VStack gap={2}>
                <HStack gap={2} wrap="wrap">
                  {(["codex", "claude"] as const).map((provider) => (
                    <Button
                      key={provider}
                      label={`Connect ${providerLabel(provider)}`}
                      variant="secondary"
                      isLoading={
                        hasDevice
                          ? creatingProvider === provider
                          : pairing.isLoading &&
                            pairing.selectedProvider === provider
                      }
                      onClick={() => onProviderClick(provider)}
                    />
                  ))}
                </HStack>
                {createError ? (
                  <Banner
                    status="error"
                    title="Could not start setup"
                    description={createError}
                  />
                ) : null}
                {pairing.error ? (
                  <Banner
                    status="error"
                    title="Could not generate a pairing code"
                    description={pairing.error}
                  />
                ) : null}
              </VStack>

              {!hasDevice && pairing.pairingCode && !pairing.isExpired ? (
                <PairingInstructions
                  code={pairing.pairingCode.code}
                  provider={pairing.pairingCode.provider}
                  remainingSeconds={pairing.remainingSeconds}
                />
              ) : null}

              {!hasDevice &&
              pairing.pairingCode &&
              pairing.isExpired ? (
                <VStack gap={2} data-testid="expired-pairing-code">
                  <Text type="supporting">
                    This pairing code has expired.
                  </Text>
                  <Button
                    label="Generate a new code"
                    variant="primary"
                    isLoading={pairing.isLoading}
                    onClick={() =>
                      pairing.pairingCode &&
                      void pairing.generatePairingCode(
                        pairing.pairingCode.provider,
                      )
                    }
                  />
                </VStack>
              ) : null}
            </VStack>
          )}

          <HStack gap={2} hAlign="end">
            <Button
              label="Set up later"
              variant="ghost"
              size="lg"
              onClick={continueToSetup}
            />
          </HStack>
        </VStack>
      </Center>
    </AppShell>
  );
}

function PairingInstructions({
  code,
  provider,
  remainingSeconds,
}: {
  code: string;
  provider: Provider;
  remainingSeconds: number;
}) {
  return (
    <VStack gap={3}>
      <VStack gap={1}>
        <Text type="label">{providerLabel(provider)} pairing code</Text>
        <Text type="display-3" weight="bold" data-testid="pairing-code">
          {code}
        </Text>
        <Text type="supporting">Expires in {remainingSeconds} seconds.</Text>
      </VStack>
      <CodeBlock
        code={`${PAIRING_COMMAND} ${code}`}
        language="bash"
        title="Terminal"
        hasLineNumbers={false}
        width="100%"
        data-testid="pairing-command"
      />
      <Banner
        status="info"
        title="What the connector installs"
        description="Meld installs in the background, restarts at login, and stores its device credential in the macOS Keychain. Provider login happens separately in that provider's own tool."
      />
    </VStack>
  );
}

function SetupProgress({
  setup,
  onContinue,
  onRetry,
  isRetrying,
}: {
  setup: ProviderSetupView;
  onContinue: () => void;
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
            isPulsing={!isTerminal(setup.status)}
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
            setup.errorMessage ??
            "Something interrupted setup on your Mac."
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
        {isReady ? (
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
