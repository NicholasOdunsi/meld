"use client";

import {
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@astryxdesign/core/DropdownMenu";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import type { Provider } from "@meld/contracts";
import Image from "next/image";
import { Fragment } from "react";
import type { AgentReadiness } from "@/features/ai/agent-readiness";
import { ComposerChip, type ComposerChipTone } from "./composer-chip";
import type { AgentRouting } from "./routing-model";
import { providerModelInfo } from "./provider-models";

const PROVIDER_LABEL: Record<Provider, string> = {
  codex: "Codex",
  claude: "Claude",
};

const MENU_LABEL = "AI model";
const MODEL_MENU_LABEL = "AI model";
const PROVIDER_MARK: Record<Provider, string> = {
  codex: "/codex-mark.svg",
  claude: "/claude-mark.svg",
};

function ProviderButtonContent({
  provider,
  model,
}: {
  provider: Provider;
  model: string;
}) {
  return (
    <HStack gap={1} vAlign="center">
      <Image
        src={PROVIDER_MARK[provider]}
        alt=""
        width={16}
        height={16}
        priority
        style={{ opacity: 0.62 }}
      />
      <Text type="body" color="inherit">
        {modelLabel(model)}
      </Text>
    </HStack>
  );
}

function ProviderMenuHeading({ provider }: { provider: Provider }) {
  return (
    <HStack gap={1} vAlign="center">
      <Image
        src={PROVIDER_MARK[provider]}
        alt=""
        width={16}
        height={16}
      />
      <Text type="body" color="secondary">
        {PROVIDER_LABEL[provider]}
      </Text>
    </HStack>
  );
}

function modelLabel(model: string): string {
  if (model.startsWith("gpt-")) {
    return model.toUpperCase();
  }
  return model
    .replace(/^claude-/, "")
    .replace(/-(\d+)-(\d+)$/, " $1.$2")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

// The chip is always rendered; only its tone, label, and menu change. Nothing
// here may return null -- a control that comes and goes is the layout jolt this
// design exists to remove.
export function AgentRoutingChip({
  readiness,
  routing,
  isAgentAddressed,
  onChoose,
  onConnect,
}: {
  readiness: AgentReadiness | undefined;
  routing: AgentRouting | undefined;
  // Whether the current draft addresses an agent. Drives weight only.
  isAgentAddressed: boolean;
  onChoose: (provider: Provider, model?: string) => void;
  onConnect: () => void;
}) {
  const tone: ComposerChipTone = isAgentAddressed ? "active" : "rest";

  // Readiness has not resolved. Claim nothing.
  if (readiness === undefined || routing === undefined) {
    if (readiness?.ready === false) {
      return (
        <ComposerChip
          label="Connect AI"
          // Amber only once an agent is actually addressed. Warning someone
          // about an AI they never asked for would be noise on a note to a
          // teammate.
          tone={isAgentAddressed ? "warning" : "rest"}
          menuLabel={MENU_LABEL}
          testId="agent-provider-picker"
        >
          <DropdownMenuItem label="Connect your AI" onClick={onConnect} />
        </ComposerChip>
      );
    }

    return (
      <ComposerChip
        label="AI"
        tone="rest"
        menuLabel={MENU_LABEL}
        testId="agent-provider-picker"
        isInert
      />
    );
  }

  const providers = readiness.ready === true ? readiness.providers : [];
  const providerModels = providers.map((candidate) => ({
    provider: candidate.provider,
    ...providerModelInfo(
      candidate.provider,
      candidate.models,
      candidate.defaultModel,
    ),
  }));
  const selectedProviderModels = providerModels.find(
    (candidate) => candidate.provider === routing.provider,
  );
  const selectedModel = selectedProviderModels?.models.includes(
    routing.model ?? "",
  )
    ? routing.model!
    : selectedProviderModels?.defaultModel;

  return (
    <ComposerChip
      label={selectedModel ? modelLabel(selectedModel) : "AI"}
      tone={tone}
      menuLabel={MENU_LABEL}
      testId="agent-provider-picker"
      buttonContent={
        selectedModel ? (
          <ProviderButtonContent
            provider={routing.provider}
            model={selectedModel}
          />
        ) : undefined
      }
    >
      <DropdownMenuRadioGroup
        aria-label={MODEL_MENU_LABEL}
        value={selectedModel ? `${routing.provider}:${selectedModel}` : undefined}
        onChange={(next) => {
          const separatorIndex = next.indexOf(":");
          const provider = next.slice(0, separatorIndex) as Provider;
          const model = next.slice(separatorIndex + 1);
          if (provider && model) {
            onChoose(provider, model);
          }
        }}
      >
        {providerModels.map(({ provider, models }) => (
          <Fragment key={provider}>
            <DropdownMenuItem
              label={<ProviderMenuHeading provider={provider} />}
              isDisabled
            />
            {models.map((model) => (
              <DropdownMenuRadioItem
                key={`${provider}:${model}`}
                value={`${provider}:${model}`}
                label={modelLabel(model)}
              />
            ))}
          </Fragment>
        ))}
      </DropdownMenuRadioGroup>
      {providers.length === 1 ? (
        <DropdownMenuItem
          label="Connect another provider..."
          onClick={onConnect}
        />
      ) : null}
    </ComposerChip>
  );
}
