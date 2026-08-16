"use client";

import { Divider } from "@astryxdesign/core/Divider";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { MeldBot } from "@/ui/meld-bot";

// The Canvas's right-edge icon rail: a single Agents entry that opens the
// sketch-aware generate/chat composer as an in-flow panel. History used to
// be a second item here, but it was just the room's conversation again --
// redundant with both the room's own Conversation surface and this same
// Agents panel -- so it was folded away rather than kept as a duplicate
// entry point.
//
// Same surface + attachment as the app's own sidebar (`workspace-navigation`
// `data-testid="workspace-rail"`): `--color-background-surface` fill with a
// vertical `Divider` seam instead of a floating bordered/shadowed `Card`, so
// this reads as part of the canvas's chrome rather than an overlay on top of
// it. The item stacks icon-over-label (unlike the app's collapsed `SideNav`
// rail, which drops the label for a hover tooltip) -- short enough here that
// the visible label reads better than a tooltip.
export function CanvasRail({
  isAgentsOpen,
  onToggleAgents,
}: {
  isAgentsOpen: boolean;
  onToggleAgents: () => void;
}) {
  return (
    <HStack
      gap={0}
      height="100%"
      data-testid="canvas-rail"
      style={{ backgroundColor: "var(--color-background-surface)" }}
    >
      <Divider orientation="vertical" />
      <VStack
        gap={2}
        width="100%"
        style={{
          paddingBlock: "var(--spacing-3)",
          paddingInline: "var(--spacing-0)",
        }}
      >
        <button
          type="button"
          aria-label="Agents"
          aria-pressed={isAgentsOpen}
          onClick={onToggleAgents}
          data-testid="canvas-rail-agents"
          style={{
            all: "unset",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "var(--spacing-1)",
            width: "100%",
            padding: "var(--spacing-2) var(--spacing-1)",
            borderRadius: "var(--radius-element)",
            cursor: "pointer",
            backgroundColor: isAgentsOpen
              ? "var(--color-background-muted)"
              : "transparent",
            color: isAgentsOpen
              ? "var(--color-text-primary)"
              : "var(--color-text-secondary)",
          }}
        >
          {/* Our agent mascot (MeldBot), not the pixel-icon set -- in the
              design-agent color so it reads apart from the product/research
              agents shown elsewhere (room header roster). */}
          <MeldBot variant="design" appearance="head" width={20} height={20} />
          <Text type="supporting" color={isAgentsOpen ? "primary" : "secondary"}>
            Agents
          </Text>
        </button>
      </VStack>
    </HStack>
  );
}
