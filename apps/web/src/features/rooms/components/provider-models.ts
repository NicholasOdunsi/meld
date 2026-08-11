import type { Provider } from "@meld/contracts";

export type ProviderModelInfo = {
  models: string[];
  defaultModel: string;
};

// Older connector status rows do not contain model metadata. Keep the picker
// useful during that rolling upgrade; the connector still validates the final
// request against its own manifest before spawning a provider.
const FALLBACK_MODELS: Record<Provider, ProviderModelInfo> = {
  codex: {
    models: ["gpt-5.5", "gpt-5.4"],
    defaultModel: "gpt-5.5",
  },
  claude: {
    models: [
      "claude-opus-4-8",
      "claude-sonnet-4-5",
      "claude-haiku-4-5",
    ],
    defaultModel: "claude-opus-4-8",
  },
};

export function providerModelInfo(
  provider: Provider,
  reportedModels?: string[],
  reportedDefaultModel?: string,
): ProviderModelInfo {
  const models = reportedModels?.length
    ? reportedModels
    : FALLBACK_MODELS[provider].models;
  const defaultModel = models.includes(reportedDefaultModel ?? "")
    ? reportedDefaultModel!
    : models[0]!;
  return { models, defaultModel };
}
