import type { Provider } from "@meld/contracts";
import type { AgentReadiness } from "@/features/ai/agent-readiness";
import { providerModelInfo } from "./provider-models";

// What the send actually forwards. Account routing remains reserved for the
// multi-account work; model is selected from the connected provider's list.
export type AgentRouting = {
  provider: Provider;
  accountId?: string;
  model?: string;
};

// Resolve the routing a send will really use. This mirrors, deliberately, the
// invariant `resolveAgentReadiness` already enforces: the resolved provider is
// always one `create_room_reply_task` will accept. A sticky override whose
// provider has since been signed out, uninstalled, or unpaired is dropped here
// rather than shown -- the chip must never promise a reply the RPC would then
// refuse.
export function resolveEffectiveRouting(
  readiness: AgentReadiness | undefined,
  override: AgentRouting | undefined,
): AgentRouting | undefined {
  if (readiness?.ready !== true) {
    return undefined;
  }

  const isOverrideRunnable = readiness.providers.some(
    (candidate) => candidate.provider === override?.provider,
  );
  if (override && isOverrideRunnable) {
    const provider = readiness.providers.find(
      (candidate) => candidate.provider === override.provider,
    );
    const modelInfo = provider
      ? providerModelInfo(
          provider.provider,
          provider.models,
          provider.defaultModel,
        )
      : undefined;
    const models = modelInfo?.models ?? [];
    const model = models.includes(override.model ?? "")
      ? override.model
      : modelInfo?.defaultModel;
    return model ? { ...override, model } : { provider: override.provider };
  }

  // readiness.providers is non-empty whenever ready is true (resolveAgentReadiness
  // returns not-ready on an empty set), so the fallback always finds a provider.
  const saved = readiness.providers.find(
    (candidate) => candidate.provider === readiness.defaultProvider,
  );
  const provider = saved ?? readiness.providers[0];
  const model = providerModelInfo(
    provider.provider,
    provider.models,
    provider.defaultModel,
  ).defaultModel;
  return model
    ? { provider: provider.provider, model }
    : { provider: provider.provider };
}
