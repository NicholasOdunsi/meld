"use client";

import { AppShell } from "@astryxdesign/core/AppShell";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Center } from "@astryxdesign/core/Center";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { Provider } from "@meld/contracts";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";
import {
  type ProviderSetupView,
  parseProviderSetupView,
} from "../provider-setup-service";
import { SetupProgress } from "./provider-setup-progress";
import {
  PAIRING_COMMAND,
  providerLabel,
  usePairingCode,
} from "./use-pairing-code";
import { useProviderSetup } from "./use-provider-setup";

export type AIConnectionDevice = {
  id: string;
  name: string;
};

const POLL_INTERVAL_MS = 2000;

function MeldMark() {
  return (
    <Image src="/meld-mark.svg" alt="" width={48} height={48} priority />
  );
}

// Provider brand marks supplied by the project. Swap the files in public/ to
// update them; ensure usage stays within each provider's brand guidelines.
const PROVIDER_MARK: Record<Provider, string> = {
  claude: "/claude-mark.svg",
  codex: "/codex-mark.svg",
};

export function AIConnectionSetup({
  workspaceId,
  devices,
  initialSetup = null,
  fakePairingCode,
}: {
  workspaceId: string;
  devices: AIConnectionDevice[];
  initialSetup?: ProviderSetupView | null;
  fakePairingCode?: string;
}) {
  const router = useRouter();
  const pairing = usePairingCode(fakePairingCode);
  const { setup, setSetup, creatingProvider, createError, createSetup, mountedRef } =
    useProviderSetup(initialSetup);

  const activeDevice = devices.at(0) ?? null;
  const hasDevice = activeDevice !== null;
  const selectedProvider = pairing.selectedProvider;
  const pairingCreatedAt = pairing.pairingCode?.createdAt ?? null;

  const continueToSetup = () =>
    router.push(`/onboarding/${workspaceId}/setup`);

  const discover = useCallback(
    async (provider: Provider, signal: AbortSignal) => {
      try {
        const createdAfter = pairingCreatedAt;
        if (!createdAfter) return;
        const query = new URLSearchParams({ provider, createdAfter });
        const response = await fetch(
          `/api/devices/provider-setups?${query.toString()}`,
          { signal },
        );
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
          if (view.provider === provider) {
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
    [mountedRef, pairingCreatedAt, setSetup],
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
  // Once a provider is picked in the first-pair flow, replace the choice cards
  // with that provider's pairing instructions plus a Back button, so the page
  // shows one thing at a time.
  const pairingActive = !hasDevice && selectedProvider !== null;

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
                void createSetup(setup.deviceId, setup.provider);
              }}
              isRetrying={creatingProvider !== null}
            />
          ) : pairingActive ? (
            <VStack gap={4}>
              <HStack gap={2} hAlign="start">
                <Button
                  label="Back"
                  variant="ghost"
                  size="lg"
                  onClick={pairing.reset}
                />
              </HStack>

              {pairing.pairingCode && !pairing.isExpired ? (
                <PairingInstructions
                  code={pairing.pairingCode.code}
                  provider={pairing.pairingCode.provider}
                  remainingSeconds={pairing.remainingSeconds}
                />
              ) : null}

              {pairing.pairingCode && pairing.isExpired ? (
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

              {!pairing.pairingCode && pairing.isLoading ? (
                <HStack gap={1} vAlign="center">
                  <Spinner size="sm" aria-label="Generating" />
                  <Text type="supporting" color="secondary">
                    Generating a pairing code…
                  </Text>
                </HStack>
              ) : null}

              {pairing.error ? (
                <Banner
                  status="error"
                  title="Could not generate a pairing code"
                  description={pairing.error}
                />
              ) : null}
            </VStack>
          ) : (
            <VStack gap={6}>
              <VStack gap={2} hAlign="center">
                <HStack gap={4} wrap="wrap" hAlign="center">
                  {(["codex", "claude"] as const).map((provider) => {
                    const isStarting = hasDevice
                      ? creatingProvider === provider
                      : pairing.isLoading &&
                        pairing.selectedProvider === provider;
                    // A provider is starting anywhere: disable both cards so the
                    // user can't launch a second setup mid-flight.
                    const anyStarting =
                      creatingProvider !== null ||
                      (pairing.isLoading &&
                        pairing.selectedProvider !== null);
                    return (
                      <ClickableCard
                        key={provider}
                        label={`Connect ${providerLabel(provider)}`}
                        variant="default"
                        padding={4}
                        width="calc(var(--spacing-12) * 3)"
                        maxWidth="calc(var(--spacing-12) * 3)"
                        isDisabled={anyStarting}
                        onClick={() => onProviderClick(provider)}
                      >
                        <VStack gap={2} hAlign="center">
                          <Image
                            src={PROVIDER_MARK[provider]}
                            alt=""
                            width={48}
                            height={48}
                          />
                          <Text type="body" weight="medium">
                            {providerLabel(provider)}
                          </Text>
                          {isStarting ? (
                            <HStack gap={1} vAlign="center">
                              <Spinner size="sm" aria-label="Starting" />
                              <Text type="supporting" color="secondary">
                                Starting…
                              </Text>
                            </HStack>
                          ) : null}
                        </VStack>
                      </ClickableCard>
                    );
                  })}
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
            </VStack>
          )}

          <HStack gap={2} hAlign="center">
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
