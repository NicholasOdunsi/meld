"use client";

// Astryx discovery (Task 11, Step 1) selected these components for the pending
// task-state surface:
//   - AgentActivity -- the live queued/waiting/running thinking state.
//   - Banner     -- the attention states (needs auth, usage limit, needs review,
//                   failed) that carry recovery actions.
//   - Button     -- the recovery actions themselves (cancel, reconnect, retry,
//                   authenticate, switch provider).
//   - VStack/HStack -- token-only layout for the recovery actions and the
//                   attention banner.
// (List/Token were reviewed and used on the message-provenance side in the
// conversation, not here.)

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import type { AgentKind, AITaskStatus, Provider } from "@meld/contracts";
import { AgentActivity } from "./agent-activity";

const PROVIDER_LABEL: Record<Provider, string> = {
  codex: "Codex",
  claude: "Claude",
};

export type AgentTaskStateProps = {
  status: AITaskStatus;
  provider: Provider;
  taskKind?: "room_reply" | "prd_generate";
  agentKind?: AgentKind;
  // The task's createdAt, used only for the elapsed counter on the pending
  // state.
  startedAt?: string | null;
  onCancel?: () => void;
  // Bring the device back online while the task waits for it.
  onReconnect?: () => void;
  // A connection/auth blocker (authentication required, usage limit): route to
  // the AI setup where the connection is actually fixed. This is the ONLY case
  // where device settings is the right destination.
  onFixConnection?: () => void;
  // A failed or needs-review reply is not a device problem. Re-ask the Product
  // Agent by refilling the composer with the original prompt as a semantic
  // mention; re-sending creates a new source message and a new task (the honest,
  // schema-respecting retry). Never routes to device settings.
  onAskAgain?: () => void;
  // PRD generation has no source-message composer to refill. A settled failed
  // or needs-review generation instead queues a fresh room-level task.
  onRetry?: () => void;
};

// The statuses that mean "still moving toward a reply". Their presentation
// now lives entirely in AgentActivity; this component owns only the recovery
// actions that sit beneath it.
const PENDING_STATUSES = new Set<AITaskStatus>([
  "queued",
  "waiting_for_device",
  "ready_to_run",
  "running",
]);

// The Product Agent's pending, safe-to-share task state for one room reply. It
// renders nothing once the task settles into a posted reply (completed) or is
// cancelled: the persisted Product Agent message becomes the authority and this
// pending affordance is removed.
export function AgentTaskState({
  status,
  provider,
  taskKind = "room_reply",
  agentKind = "product",
  startedAt,
  onCancel,
  onReconnect,
  onFixConnection,
  onAskAgain,
  onRetry,
}: AgentTaskStateProps) {
  const providerLabel = PROVIDER_LABEL[provider];

  if (status === "completed" || status === "cancelled") {
    return null;
  }

  const isPending = PENDING_STATUSES.has(status);
  if (isPending) {
    return (
      <VStack gap={1.5} data-testid="agent-task-state">
        <AgentActivity
          status={status}
          provider={provider}
          kind={taskKind}
          agentKind={agentKind}
          startedAt={startedAt}
        />
        {status === "waiting_for_device" ? (
          <HStack gap={2}>
            <Button
              variant="secondary"
              size="sm"
              label="Reconnect"
              onClick={onReconnect}
            />
            <Button
              variant="ghost"
              size="sm"
              label="Cancel"
              onClick={onCancel}
            />
          </HStack>
        ) : (
          <HStack gap={2}>
            <Button
              variant="ghost"
              size="sm"
              label="Cancel"
              onClick={onCancel}
            />
          </HStack>
        )}
      </VStack>
    );
  }

  const attention =
    taskKind === "prd_generate"
      ? PRD_ATTENTION_PRESENTATION[status]
      : ATTENTION_PRESENTATION[status];
  if (!attention) {
    return null;
  }

  // Each attention state carries exactly one action whose label matches what it
  // does: a connection blocker routes to setup ("Fix connection"); a usage limit
  // is the caller's own provider quota, so it routes to the same AI setup but as
  // "Switch provider" (reconnecting cannot lift a quota); a failed or
  // needs-review reply re-asks the agent ("Ask again"). No button that navigates
  // is ever labelled "Retry", and a failed/needs-review reply never routes to
  // device settings.
  const action =
    attention.action === "fix_connection"
      ? { label: "Fix connection", onClick: onFixConnection }
      : attention.action === "switch_provider"
        ? { label: "Switch provider", onClick: onFixConnection }
        : attention.action === "retry"
          ? { label: "Try again", onClick: onRetry }
          : { label: "Ask again", onClick: onAskAgain };

  return (
    <Banner
      container="card"
      status={attention.bannerStatus}
      title={attention.title.replace("{provider}", providerLabel)}
      description={`${attention.description} (via ${providerLabel})`}
      endContent={
        <HStack gap={2}>
          <Button
            variant="secondary"
            size="sm"
            label={action.label}
            onClick={action.onClick}
          />
        </HStack>
      }
    />
  );
}

type AttentionPresentation = {
  bannerStatus: "info" | "warning" | "error" | "success";
  // A `{provider}` token is replaced with the reply's provider label (Claude /
  // Codex) at render, so a message can name the specific provider.
  title: string;
  description: string;
  action: "fix_connection" | "switch_provider" | "ask_again" | "retry";
};

const ATTENTION_PRESENTATION: Partial<
  Record<AITaskStatus, AttentionPresentation>
> = {
  needs_reauthentication: {
    bannerStatus: "warning",
    title: "Authentication required",
    description: "Reconnect the provider in your AI setup to continue.",
    action: "fix_connection",
  },
  usage_limit_reached: {
    bannerStatus: "warning",
    title: "Your {provider} usage limit was reached",
    description:
      "This is your own provider's limit, not the app — switch providers or try again after it resets.",
    action: "switch_provider",
  },
  needs_review: {
    bannerStatus: "error",
    title: "The reply needs review",
    description: "The Product Agent reply could not be posted automatically.",
    action: "ask_again",
  },
  failed: {
    bannerStatus: "error",
    title: "The Product Agent could not reply",
    description: "Ask the Product Agent again to try a fresh reply.",
    action: "ask_again",
  },
};

const PRD_ATTENTION_PRESENTATION: Partial<
  Record<AITaskStatus, AttentionPresentation>
> = {
  needs_reauthentication: {
    bannerStatus: "warning",
    title: "Authentication required",
    description: "Reconnect the provider to continue PRD generation.",
    action: "fix_connection",
  },
  usage_limit_reached: {
    bannerStatus: "warning",
    title: "Your {provider} usage limit was reached",
    description:
      "This is your own provider's limit, not the app — switch providers or try again after it resets.",
    action: "switch_provider",
  },
  needs_review: {
    bannerStatus: "error",
    title: "The PRD needs review",
    description: "PRD generation could not finish automatically.",
    action: "retry",
  },
  failed: {
    bannerStatus: "error",
    title: "The PRD could not be generated",
    description: "Try a fresh generation from the room context.",
    action: "retry",
  },
};
