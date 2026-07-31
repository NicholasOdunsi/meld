"use client";

// Astryx discovery (Task 11, Step 1) selected these components for the pending
// task-state surface:
//   - StatusDot  -- the live queued/waiting/running presence dot, always paired
//                   with a visible text label.
//   - Banner     -- the attention states (needs auth, usage limit, needs review,
//                   failed) that carry recovery actions.
//   - Button     -- the recovery actions themselves (cancel, reconnect, retry,
//                   authenticate, switch provider).
//   - Text/VStack/HStack -- token-only layout and the non-authoritative streamed
//                   progress region.
// (List/Token were reviewed and used on the message-provenance side in the
// conversation, not here.)

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { AITaskStatus, Provider } from "@meld/contracts";

const PROVIDER_LABEL: Record<Provider, string> = {
  codex: "Codex",
  claude: "Claude",
};

export type AgentTaskStateProps = {
  status: AITaskStatus;
  provider: Provider;
  // Progress text streamed while the task runs. It is NEVER the authoritative
  // reply -- the persisted Product Agent message delivered over Realtime is.
  // Shown only to reassure the room that work is happening, and always marked
  // non-authoritative so it is never mistaken for the final answer.
  streamedText?: string | null;
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
};

type PendingPresentation = {
  variant: "success" | "warning" | "error" | "accent" | "neutral";
  label: string;
  isPulsing: boolean;
};

const PENDING_PRESENTATION: Partial<
  Record<AITaskStatus, PendingPresentation>
> = {
  queued: { variant: "neutral", label: "Queued", isPulsing: true },
  waiting_for_device: {
    variant: "warning",
    label: "Waiting for your device",
    isPulsing: true,
  },
  ready_to_run: { variant: "accent", label: "Starting", isPulsing: true },
  running: { variant: "accent", label: "Responding", isPulsing: true },
};

function StreamedProgress({ text }: { text: string }) {
  return (
    <VStack
      gap={0.5}
      data-testid="agent-streamed-progress"
      data-authoritative="false"
    >
      <Text type="supporting" color="secondary">
        Draft — not the final reply
      </Text>
      <Text type="body" color="secondary">
        {text}
      </Text>
    </VStack>
  );
}

// The Product Agent's pending, safe-to-share task state for one room reply. It
// renders nothing once the task settles into a posted reply (completed) or is
// cancelled: the persisted Product Agent message becomes the authority and this
// pending affordance is removed.
export function AgentTaskState({
  status,
  provider,
  streamedText,
  onCancel,
  onReconnect,
  onFixConnection,
  onAskAgain,
}: AgentTaskStateProps) {
  const providerLabel = PROVIDER_LABEL[provider];

  if (status === "completed" || status === "cancelled") {
    return null;
  }

  const pending = PENDING_PRESENTATION[status];
  if (pending) {
    return (
      <VStack gap={1.5} data-testid="agent-task-state">
        <HStack gap={2} vAlign="center">
          <StatusDot
            variant={pending.variant}
            label={pending.label}
            isPulsing={pending.isPulsing}
          />
          <Text type="label">{pending.label}</Text>
          <Text type="supporting" color="secondary">
            {status === "running"
              ? `Product Agent is responding via ${providerLabel}`
              : `Product Agent · ${providerLabel}`}
          </Text>
        </HStack>
        {status === "running" && streamedText ? (
          <StreamedProgress text={streamedText} />
        ) : null}
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

  const attention = ATTENTION_PRESENTATION[status];
  if (!attention) {
    return null;
  }

  // Each attention state carries exactly one action whose label matches what it
  // does: a connection blocker routes to setup ("Fix connection"); a failed or
  // needs-review reply re-asks the agent ("Ask again"). No button that navigates
  // is ever labelled "Retry", and a failed/needs-review reply never routes to
  // device settings.
  const action =
    attention.action === "fix_connection"
      ? { label: "Fix connection", onClick: onFixConnection }
      : { label: "Ask again", onClick: onAskAgain };

  return (
    <Banner
      container="card"
      status={attention.bannerStatus}
      title={attention.title}
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
  title: string;
  description: string;
  action: "fix_connection" | "ask_again";
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
    title: "Usage limit reached",
    description: "Switch or reconnect the provider in your AI setup.",
    action: "fix_connection",
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
