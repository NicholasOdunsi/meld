"use client";

import { Center } from "@astryxdesign/core/Center";
import { MeldBot } from "@/ui/meld-bot";
import type { AgentKind } from "@meld/contracts";

export type { AgentKind } from "@meld/contracts";

export const DISCOVERY_AGENTS = [
  {
    id: "agent:product",
    kind: "product",
    name: "Product Agent",
    // What it does, shown as the mention subtext instead of a generic label.
    description: "Answers product questions from the room",
  },
  {
    id: "agent:research",
    kind: "research",
    name: "Research Agent",
    description: "Finds and synthesizes research",
  },
] as const;

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
      <MeldBot
        variant={kind}
        appearance="head"
        data-testid={`${kind}-agent-bot`}
      />
    </Center>
  );
}
