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

// Mapping a user flow is a fork, not a plain prefill: it's the one starter
// that asks how the flow should get built before doing anything, so clicking
// it opens the choice card in the composer (onChooseUserFlow) instead of
// dropping a prompt straight in.
const MAP_USER_FLOW_LABEL = "Map a User Flow";
// The message the choice card's "Let the agent do it" option pre-fills.
// Exported so the composer-side card and its handler share one source of
// truth rather than re-deriving the agent mention.
export const MAP_USER_FLOW_PROMPT = `@${PRODUCT_AGENT_NAME} create a user flow for `;

const STARTERS: readonly RoomStarter[] = [
  {
    label: "Plan a Feature",
    description:
      "Define requirements and edge cases with agents and teammates",
    icon: "/room-starters/plan-feature.svg",
    prompt: `@${PRODUCT_AGENT_NAME} I want to plan a feature for `,
  },
  {
    label: MAP_USER_FLOW_LABEL,
    description: "Turn an idea into a step-by-step flow with agents and teammates",
    icon: "/room-starters/map-user-flow.svg",
    prompt: MAP_USER_FLOW_PROMPT,
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
  onChooseUserFlow,
}: {
  // Fills the composer with a starter prompt and drops the caret at its end.
  onPrefill: (prompt: string) => void;
  // Opens the "map it myself / let the agent do it" choice card. The card
  // lives in the composer dock (owned by the conversation), not here, so the
  // one starter that forks just signals the choice rather than acting.
  onChooseUserFlow: () => void;
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
          onClick={() =>
            starter.label === MAP_USER_FLOW_LABEL
              ? onChooseUserFlow()
              : onPrefill(starter.prompt)
          }
        />
      ))}
    </List>
  );
}
