"use client";

import { List, ListItem } from "@astryxdesign/core/List";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

// Fixed square box for every starter icon, contain-fit. Kept smaller than
// the conversation's 32px starters -- the Agents panel is narrow, so a
// 20px glyph reads cleanly beside the short label without crowding.
const starterIconStyle = {
  blockSize: "var(--spacing-5)",
  inlineSize: "var(--spacing-5)",
  objectFit: "contain",
} as const;

function StarterIcon({ src }: { src: string }) {
  return (
    // Plain <img>, not next/image: hand-authored pixel-art SVGs served
    // straight from /public, exactly like EmptyRoomStart's starter icons.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" aria-hidden="true" style={starterIconStyle} />
  );
}

type AgentStarter = {
  label: string;
  icon: string;
  // What clicking the row does: prefill drops the partial instruction into the
  // composer; upload opens the design-system file picker instead.
  action: { kind: "prefill"; prompt: string } | { kind: "upload" };
};

// Short labels only -- the Agents panel is narrow, so descriptions would wrap
// one-word-per-line. The pixel icon carries the visual weight instead.
const STARTERS: readonly AgentStarter[] = [
  {
    label: "Add a design system",
    icon: "/agent-starters/design-system.svg",
    action: { kind: "upload" },
  },
  {
    label: "Create a prototype",
    icon: "/agent-starters/prototype.svg",
    action: { kind: "prefill", prompt: "Create a screen for " },
  },
  {
    label: "Sketch a screen",
    icon: "/agent-starters/sketch.svg",
    action: { kind: "prefill", prompt: "Build a screen from my sketch: " },
  },
];

export function AgentsEmptyStart({
  onPrefill,
  onAddDesignSystem,
}: {
  onPrefill: (prompt: string) => void;
  onAddDesignSystem: () => void;
}) {
  return (
    <VStack
      height="100%"
      width="100%"
      vAlign="end"
      // Inset the rows from the panel's left edge so the icons aren't flush
      // against it.
      style={{ paddingInlineStart: "var(--spacing-3)" }}
      data-testid="agents-empty-start"
    >
      <List density="spacious">
        {STARTERS.map((starter) => (
          <ListItem
            key={starter.label}
            label={
              <Text type="label" color="secondary">
                {starter.label}
              </Text>
            }
            startContent={<StarterIcon src={starter.icon} />}
            onClick={() =>
              starter.action.kind === "upload"
                ? onAddDesignSystem()
                : onPrefill(starter.action.prompt)
            }
          />
        ))}
      </List>
    </VStack>
  );
}
