"use client";

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
import { MeldAuthShell } from "@/ui/meld/auth-shell";
import { MeldBanner } from "@/ui/meld/banner";
import { MeldButton } from "@/ui/meld/button";
import { MeldChoiceCard, MeldChoiceGrid } from "@/ui/meld/choice-card";
import { MeldCodeBlock } from "@/ui/meld/code-block";
import {
  MeldCard,
  MeldCenteredActions,
  MeldCode,
  MeldLabel,
  MeldLoadingNote,
  MeldNote,
  MeldSectionHeading,
  MeldStack,
  MeldStartActions,
  MeldStep,
  MeldSteps,
  MeldSupportingText,
} from "@/ui/meld/stack";

export type AIConnectionDevice = {
  id: string;
  name: string;
};

const POLL_INTERVAL_MS = 2000;

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
    <MeldAuthShell
      title="Connect your AI."
      subtitle="Bring your own agents. They run on your Mac, on your account — never ours."
      // Wide: the pairing command is one long unbreakable token, and the setup
      // steps read badly in a 26rem column.
      width="wide"
    >
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
        <MeldStack gap={4}>
          {pairing.pairingCode && !pairing.isExpired ? (
            <PairingInstructions
              code={pairing.pairingCode.code}
              provider={pairing.pairingCode.provider}
              remainingSeconds={pairing.remainingSeconds}
            />
          ) : null}

          {pairing.pairingCode && pairing.isExpired ? (
            <MeldStack gap={2}>
              <MeldNote>This pairing code has expired.</MeldNote>
              <MeldStartActions>
                <MeldButton
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
              </MeldStartActions>
            </MeldStack>
          ) : null}

          {!pairing.pairingCode && pairing.isLoading ? (
            <MeldLoadingNote>Generating a pairing code</MeldLoadingNote>
          ) : null}

          {pairing.error ? (
            <MeldBanner
              status="error"
              title="Could not generate a pairing code"
              description={pairing.error}
            />
          ) : null}
        </MeldStack>
      ) : (
        <MeldStack gap={4}>
          <MeldChoiceGrid>
            {(["codex", "claude"] as const).map((provider) => {
              const isStarting = hasDevice
                ? creatingProvider === provider
                : pairing.isLoading &&
                  pairing.selectedProvider === provider;
              // A provider is starting anywhere: disable both cards so the
              // user can't launch a second setup mid-flight.
              const anyStarting =
                creatingProvider !== null ||
                (pairing.isLoading && pairing.selectedProvider !== null);
              return (
                <MeldChoiceCard
                  key={provider}
                  label={`Connect ${providerLabel(provider)}`}
                  title={providerLabel(provider)}
                  media={
                    <Image
                      src={PROVIDER_MARK[provider]}
                      alt=""
                      width={48}
                      height={48}
                    />
                  }
                  status={isStarting ? "Starting" : undefined}
                  isDisabled={anyStarting}
                  onClick={() => onProviderClick(provider)}
                />
              );
            })}
          </MeldChoiceGrid>
          {createError ? (
            <MeldBanner
              status="error"
              title="Could not start setup"
              description={createError}
            />
          ) : null}
          {pairing.error ? (
            <MeldBanner
              status="error"
              title="Could not generate a pairing code"
              description={pairing.error}
            />
          ) : null}
        </MeldStack>
      )}

      <MeldCenteredActions>
        <MeldButton
          label="Set up later"
          variant="ghost"
          size="lg"
          onClick={continueToSetup}
        />
      </MeldCenteredActions>
    </MeldAuthShell>
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
    <MeldStack gap={3}>
      <MeldStack gap={2}>
        <MeldLabel>{providerLabel(provider)} pairing code</MeldLabel>
        <MeldCode data-testid="pairing-code">{code}</MeldCode>
        <MeldSupportingText>
          Expires in {remainingSeconds} seconds.
        </MeldSupportingText>
      </MeldStack>
      <MeldCodeBlock
        code={`${PAIRING_COMMAND} ${code}`}
        title="Terminal"
        data-testid="pairing-command"
      />
      <MeldCard>
        <MeldStack gap={4}>
          <MeldSectionHeading>What happens next</MeldSectionHeading>
          <MeldSteps>
            <MeldStep>Run that command in Terminal on your Mac.</MeldStep>
            <MeldStep>
              A small connector installs and restarts at login.
            </MeldStep>
            <MeldStep>Your credential stays in the macOS Keychain.</MeldStep>
            <MeldStep>
              Sign in to {providerLabel(provider)} in its own tool — runs bill
              to your subscription.
            </MeldStep>
          </MeldSteps>
        </MeldStack>
      </MeldCard>
    </MeldStack>
  );
}
