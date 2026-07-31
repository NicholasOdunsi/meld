"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import {
  PAIRING_COMMAND,
  providerLabel,
  usePairingCode,
} from "./use-pairing-code";

export function ConnectDevice({
  fakePairingCode,
}: {
  fakePairingCode?: string;
}) {
  const {
    selectedProvider,
    pairingCode,
    isLoading,
    error,
    remainingSeconds,
    isExpired,
    generatePairingCode,
  } = usePairingCode(fakePairingCode);

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
              isLoading={isLoading && selectedProvider === provider}
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
