"use client";

import { Center } from "@astryxdesign/core/Center";
import { Icon } from "@astryxdesign/core/Icon";
import { Robot } from "@boxicons/react/Robot";
import { Search } from "@boxicons/react/Search";
import type { SVGProps } from "react";

export type AgentKind = "product" | "research";

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
    icon: "xsm",
  },
  md: {
    container: "var(--spacing-9)",
    icon: "sm",
  },
  lg: {
    container: "var(--spacing-12)",
    icon: "lg",
  },
} as const;

const AGENT_COLOR = {
  product: {
    background: "var(--color-icon-purple)",
    foreground: "var(--color-on-dark)",
  },
  research: {
    background: "var(--color-icon-teal)",
    foreground: "var(--color-on-dark)",
  },
} as const;

function FilledRobot(props: SVGProps<SVGSVGElement>) {
  return <Robot {...props} pack="filled" />;
}

function FilledSearch(props: SVGProps<SVGSVGElement>) {
  return <Search {...props} pack="filled" />;
}

const AGENT_ICON = {
  product: FilledRobot,
  research: FilledSearch,
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
  const colors = AGENT_COLOR[kind];

  return (
    <Center
      role="img"
      aria-label={name}
      width={markerSize.container}
      height={markerSize.container}
      data-testid={`${kind}-agent-avatar`}
      style={{
        backgroundColor: colors.background,
        border: "var(--border-width) solid var(--color-background-surface)",
        borderRadius: "var(--radius-full)",
        boxSizing: "border-box",
        color: colors.foreground,
        flexShrink: 0,
        marginInlineStart: isGrouped
          ? "calc(var(--spacing-1) * -1)"
          : undefined,
      }}
    >
      <Icon
        icon={AGENT_ICON[kind]}
        size={markerSize.icon}
        color="inherit"
      />
    </Center>
  );
}
