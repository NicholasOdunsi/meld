"use client";

import { List, ListItem } from "@astryxdesign/core/List";
import { Text } from "@astryxdesign/core/Text";
import { DISCOVERY_AGENTS } from "./agent-marker";

// Resolved from the same source the composer parses mentions against, so the
// pre-filled "@Product Agent" / "@Research Agent" prefix is recognised as a
// real mention (deriveMentionSubmission) rather than plain prose.
const PRODUCT_AGENT_NAME =
  DISCOVERY_AGENTS.find((agent) => agent.kind === "product")?.name ??
  "Product Agent";
const RESEARCH_AGENT_NAME =
  DISCOVERY_AGENTS.find((agent) => agent.kind === "research")?.name ??
  "Research Agent";
const DESIGN_AGENT_NAME =
  DISCOVERY_AGENTS.find((agent) => agent.kind === "design")?.name ??
  "Design Agent";

// Fixed square box for every icon, contain-fit so the three source
// illustrations (each a different native aspect ratio) all read as the same
// size instead of the box just following each one's own proportions.
const starterIconStyle = {
  blockSize: "var(--spacing-8)",
  inlineSize: "var(--spacing-8)",
  objectFit: "contain",
} as const;

function StarterIcon({ src }: { src: string }) {
  return (
    // Plain <img>, not next/image: these are hand-authored SVG illustrations
    // served straight from /public, and next/image blocks SVG sources by
    // default (dangerouslyAllowSVG is off, and turning it on to optimize a
    // handful of static icons isn't worth the SVG-sanitization tradeoff).
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" aria-hidden="true" style={starterIconStyle} />
  );
}

type RoomStarter = {
  label: string;
  description: string;
  icon: string;
  // The partial prompt dropped into the composer. Each ends with a trailing
  // space so the caret lands where the user keeps typing the specifics, and
  // opens with the agent mention that routes the eventual send.
  prompt: string;
};

const STARTERS: readonly RoomStarter[] = [
  {
    label: "Plan a Feature",
    description:
      "Define requirements and edge cases with agents and teammates",
    icon: "/room-starters/plan-feature.svg",
    prompt: `@${PRODUCT_AGENT_NAME} I want to plan a feature for `,
  },
  {
    label: "Design a Screen",
    description: "Turn an idea into a clickable prototype with agents and teammates",
    icon: "/room-starters/design-screen.svg",
    prompt: `@${DESIGN_AGENT_NAME} design a screen for `,
  },
  {
    label: "Brainstorm",
    description: "Explore possibilities and directions with agents and teammates",
    icon: "/room-starters/brainstorm.svg",
    prompt: `@${RESEARCH_AGENT_NAME} I want to brainstorm ideas for `,
  },
];

export function EmptyRoomStart({
  onPrefill,
}: {
  // Fills the composer with a starter prompt and drops the caret at its end.
  onPrefill: (prompt: string) => void;
}) {
  return (
    <List density="spacious" data-testid="empty-room-start">
      {STARTERS.map((starter) => (
        <ListItem
          key={starter.label}
          label={
            <Text type="label" color="secondary">
              {`${starter.label} — ${starter.description}`}
            </Text>
          }
          startContent={<StarterIcon src={starter.icon} />}
          onClick={() => onPrefill(starter.prompt)}
        />
      ))}
    </List>
  );
}
