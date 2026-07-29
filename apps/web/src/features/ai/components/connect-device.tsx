"use client";

import type { Provider } from "@meld/contracts";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useEffect, useRef, useState } from "react";

type PairingCode = {
  code: string;
  expiresAt: string;
  provider: Provider;
};

const PAIRING_COMMAND =
  "pnpm --filter @meld/connector cli -- pair --join";
const FAKE_CODE_LIFETIME_MS = 5 * 60 * 1000;
const GENERIC_PAIRING_ERROR =
  "We could not create a pairing code. Please try again.";
const PAIRING_CODE_QUOTA =
  "Use the pairing code already on screen before generating another one.";

class PairingCodeRequestError extends Error {}

function parsePairingCode(
  value: unknown,
  provider: Provider,
): PairingCode {
  if (
    typeof value !== "object" ||
    value === null ||
    !("code" in value) ||
    typeof value.code !== "string" ||
    value.code.length === 0 ||
    !("expiresAt" in value) ||
    typeof value.expiresAt !== "string" ||
    !Number.isFinite(new Date(value.expiresAt).getTime())
  ) {
    throw new PairingCodeRequestError(GENERIC_PAIRING_ERROR);
  }

  return {
    code: value.code,
    expiresAt: value.expiresAt,
    provider,
  };
}

async function pairingCodeError(response: Response) {
  if (response.status !== 400) {
    return GENERIC_PAIRING_ERROR;
  }

  try {
    const body = (await response.json()) as unknown;
    if (
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      body.error === PAIRING_CODE_QUOTA
    ) {
      return body.error;
    }
  } catch {
    // The generic copy below is safe for malformed error responses.
  }

  return GENERIC_PAIRING_ERROR;
}

function providerLabel(provider: Provider) {
  return provider === "codex" ? "Codex" : "Claude";
}

export function ConnectDevice({
  fakePairingCode,
}: {
  fakePairingCode?: string;
}) {
  const [selectedProvider, setSelectedProvider] =
    useState<Provider | null>(null);
  const [pairingCode, setPairingCode] =
    useState<PairingCode | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestRequest = useRef(0);

  useEffect(() => {
    if (!pairingCode) {
      return;
    }

    const expiration = new Date(pairingCode.expiresAt).getTime();
    const timer = window.setInterval(() => {
      const currentTime = Date.now();
      setNow(currentTime);
      if (currentTime >= expiration) {
        window.clearInterval(timer);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [pairingCode]);

  async function generatePairingCode(provider: Provider) {
    const request = latestRequest.current + 1;
    latestRequest.current = request;
    setSelectedProvider(provider);
    setIsLoading(true);
    setError(null);

    try {
      if (fakePairingCode) {
        if (request !== latestRequest.current) {
          return;
        }
        setPairingCode({
          code: fakePairingCode,
          expiresAt: new Date(
            now + FAKE_CODE_LIFETIME_MS,
          ).toISOString(),
          provider,
        });
        return;
      }

      const response = await fetch("/api/devices/pairing-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestedProvider: provider }),
      });

      if (!response.ok) {
        throw new PairingCodeRequestError(
          await pairingCodeError(response),
        );
      }

      const nextPairingCode = parsePairingCode(
        await response.json(),
        provider,
      );
      if (request !== latestRequest.current) {
        return;
      }
      setPairingCode(nextPairingCode);
    } catch (caught) {
      if (request !== latestRequest.current) {
        return;
      }
      setError(
        caught instanceof PairingCodeRequestError
          ? caught.message
          : GENERIC_PAIRING_ERROR,
      );
    } finally {
      if (request === latestRequest.current) {
        setIsLoading(false);
      }
    }
  }

  const expiresAt = pairingCode
    ? new Date(pairingCode.expiresAt).getTime()
    : null;
  const isExpired = expiresAt !== null && expiresAt <= now;
  const remainingSeconds =
    expiresAt === null
      ? 0
      : Math.max(0, Math.ceil((expiresAt - now) / 1000));

  return (
    <VStack gap={6} width="100%">
      <VStack gap={2}>
        <Heading level={2}>Connect this Mac</Heading>
        <Text type="supporting">
          Choose the provider you want Meld to run on this device.
          Provider login happens separately in that provider&apos;s own
          tool.
        </Text>
        <HStack gap={2} wrap="wrap">
          {(["codex", "claude"] as const).map((provider) => (
            <Button
              key={provider}
              label={`Connect ${providerLabel(provider)}`}
              variant="secondary"
              isLoading={
                isLoading && selectedProvider === provider
              }
              onClick={() => generatePairingCode(provider)}
            />
          ))}
        </HStack>
      </VStack>

      {error ? (
        <Banner
          status="error"
          title="Could not generate a pairing code"
          description={error}
        />
      ) : null}

      {pairingCode && !isExpired ? (
        <VStack gap={3}>
          <VStack gap={1}>
            <Text type="label">
              {providerLabel(pairingCode.provider)} pairing code
            </Text>
            <Text
              type="display-3"
              weight="bold"
              data-testid="pairing-code"
            >
              {pairingCode.code}
            </Text>
            <Text type="supporting">
              Expires in {remainingSeconds} seconds.
            </Text>
          </VStack>
          <CodeBlock
            code={`${PAIRING_COMMAND} ${pairingCode.code}`}
            language="bash"
            title="Terminal"
            hasLineNumbers={false}
            width="100%"
            data-testid="pairing-command"
          />
        </VStack>
      ) : null}

      {pairingCode && isExpired ? (
        <VStack gap={2} data-testid="expired-pairing-code">
          <Text type="supporting">
            This pairing code has expired.
          </Text>
          <Button
            label="Generate a new code"
            variant="primary"
            isLoading={isLoading}
            onClick={() => generatePairingCode(pairingCode.provider)}
          />
        </VStack>
      ) : null}

      <VStack gap={3} data-testid="connector-disclosure">
        <Banner
          status="info"
          title="What the connector installs"
          description={
            <VStack gap={2}>
              <Text>
                Meld installs under ~/Library/Application Support/Meld/,
                runs in the background, and restarts at login. Its device
                credential is stored in the macOS Keychain.
              </Text>
              <Text>
                Provider login happens separately in the provider&apos;s
                own tool. No Xcode, no Homebrew, no sudo, and no open
                Terminal after setup are required.
              </Text>
              <Text>
                To pause it, stop the connector. To remove it completely,
                run pnpm --filter @meld/connector cli -- uninstall.
              </Text>
            </VStack>
          }
        />
      </VStack>
    </VStack>
  );
}
