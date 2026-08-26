"use client";

import { Center } from "@astryxdesign/core/Center";
import { MeldAgent } from "@/ui/meld-agent";
import { AGENT_CATALOG } from "@/features/agents/catalog";
import type { AgentKind } from "@meld/contracts";

export type { AgentKind } from "@meld/contracts";

/**
 * The mention picker's cast.
 *
 * Derived from `AGENT_CATALOG` rather than written out again: the console's
 * teammate rows show the same `description` as the mention subtext, and two
 * hand-kept copies of one sentence is how they end up disagreeing.
 */
export const DISCOVERY_AGENTS = AGENT_CATALOG.map((agent) => ({
  id: agent.mentionId,
  kind: agent.kind,
  name: agent.name,
  // What it does, shown as the mention subtext instead of a generic label.
  description: agent.description,
}));

const MARKER_SIZE = {
  sm: {
    container: "var(--spacing-6)",
  },
  md: {
    container: "var(--spacing-9)",
  },
  lg: {
    container: "var(--spacing-12)",
  },
} as const;

export function AgentMarker({
  kind,
  name,
  size = "sm",
  isGrouped = false,
}: {
  kind: AgentKind;
  name: string;
  size?: keyof typeof MARKER_SIZE;
  isGrouped?: boolean;
}) {
  const markerSize = MARKER_SIZE[size];

  return (
    <Center
      role="img"
      aria-label={name}
      width={markerSize.container}
      height={markerSize.container}
      data-testid={`${kind}-agent-avatar`}
      data-housing="none"
      style={{
        flexShrink: 0,
        marginInlineStart: isGrouped
          ? "calc(var(--spacing-1) * -1)"
          : undefined,
      }}
    >
      <MeldAgent
        variant={kind}
        appearance="head"
        data-testid={`${kind}-agent-bot`}
      />
    </Center>
  );
}
