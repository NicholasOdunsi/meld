"use client";

import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { AITaskStatus, Provider } from "@meld/contracts";
import { useEffect, useState, type ReactNode } from "react";
import { useIsMounted } from "@/ui/use-is-mounted";
import { WaveText } from "@/ui/wave-text";

const PROVIDER_LABEL: Record<Provider, string> = {
  codex: "Codex",
  claude: "Claude",
};

export type AgentActivityKind = "room_reply" | "prd_generate";

// Only the four statuses a task can actually be moving through. Every other
// AITaskStatus is settled or parked awaiting a user action, and is rendered
// by AgentTaskState's Banner path instead.
const ACTIVE_LABEL: Partial<
  Record<AITaskStatus, Record<AgentActivityKind, string>>
> = {
  queued: { room_reply: "Queued", prd_generate: "Queued" },
  waiting_for_device: {
    room_reply: "Waiting for your device",
    prd_generate: "Waiting for your device",
  },
  ready_to_run: { room_reply: "Starting", prd_generate: "Starting" },
  running: {
    room_reply: "Responding",
    prd_generate: "Drafting your PRD",
  },
};

export type AgentActivityProps = {
  status: AITaskStatus;
  // Absent while PrdGenerating renders before any task row exists. The
  // attribution line is omitted rather than guessed.
  provider?: Provider;
  kind?: AgentActivityKind;
  startedAt?: string | null;
  size?: "inline" | "hero";
  // Reserved slot for a future reasoning transcript. Nothing passes
  // children today; see the design doc's "The Reserved Slot".
  children?: ReactNode;
};

// `isActive` must come from the same status check that decides whether
// AgentActivity renders at all (see `label` below), so the two can never
// drift: if the component renders null, the interval must not be running.
// Gating on `startedAt` alone isn't enough -- a parent that keeps this
// component mounted at the same tree position while status moves from
// active to settled, with startedAt unchanged, would otherwise leave the
// prior interval ticking forever.
function useElapsedSeconds(
  startedAt: string | null | undefined,
  isActive: boolean,
) {
  const isMounted = useIsMounted();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAt || !isActive) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt, isActive]);

  // Elapsed time differs between the server render and the client, so it
  // stays absent until mounted rather than causing a hydration mismatch.
  if (!isMounted || !startedAt || !isActive) return null;
  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) return null;
  return Math.max(0, Math.floor((now - started) / 1000));
}

// The Product Agent's live thinking state. Shows only what the browser
// genuinely knows -- the task's status, its provider, and how long it has
// been running. It never claims a step it cannot observe.
export function AgentActivity({
  status,
  provider,
  kind = "room_reply",
  startedAt,
  size = "inline",
  children,
}: AgentActivityProps) {
  const label = ACTIVE_LABEL[status]?.[kind];
  const elapsedSeconds = useElapsedSeconds(startedAt, label !== undefined);

  if (!label) {
    return null;
  }

  const providerLabel = provider ? PROVIDER_LABEL[provider] : null;

  return (
    <VStack gap={1.5} data-testid="agent-activity">
      <HStack gap={2} vAlign="center">
        <WaveText text={label} type={size === "hero" ? "large" : "label"} />
        {elapsedSeconds === null ? null : (
          <Text type="supporting" color="secondary">
            {`${elapsedSeconds}s`}
          </Text>
        )}
      </HStack>
      {providerLabel ? (
        <Text type="supporting" color="secondary">
          {status === "running"
            ? `Product Agent is responding via ${providerLabel}`
            : `Product Agent · ${providerLabel}`}
        </Text>
      ) : null}
      {children}
    </VStack>
  );
}
