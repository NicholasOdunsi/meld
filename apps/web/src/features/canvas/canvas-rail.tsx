"use client";

import type { ReactNode } from "react";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { MeldBot } from "@/ui/meld-bot";
import { PixelHistory } from "@/ui/pixel-icons";

export type CanvasRailItem = "history" | "agents";

const RAIL_ITEMS: ReadonlyArray<{
  id: CanvasRailItem;
  label: string;
  renderIcon: (isActive: boolean) => ReactNode;
}> = [
  {
    id: "history",
    label: "History",
    renderIcon: (isActive) => (
      <PixelHistory pack={isActive ? "filled" : "basic"} size="sm" />
    ),
  },
  {
    id: "agents",
    label: "Agents",
    // Our agent mascot (MeldBot), not the pixel-icon set -- in the
    // design-agent color so it reads apart from the product/research agents
    // shown elsewhere (room header roster).
    renderIcon: () => (
      <MeldBot variant="design" appearance="head" width={20} height={20} />
    ),
  },
];

// The Canvas's right-edge icon rail: consolidates History (the conversation
// + design-event timeline) and Agents (the sketch-aware generate/chat
// composer) behind one consistent entry point, replacing the old
// button-toggled drawer + always-open floating composer. Only one item is
// ever active -- selecting the other swaps the open panel; selecting the
// active item again collapses it (both handled by the caller via `onSelect`
// and `active`).
//
// Same surface + attachment as the app's own sidebar (`workspace-navigation`
// `data-testid="workspace-rail"`): `--color-background-surface` fill with a
// vertical `Divider` seam instead of a floating bordered/shadowed `Card`, so
// this reads as part of the canvas's chrome rather than an overlay on top of
// it. Items stack icon-over-label (unlike the app's collapsed `SideNav`
// rail, which drops the label for a hover tooltip) -- this rail is only ever
// two items, short enough that the visible label reads better than a
// tooltip.
export function CanvasRail({
  active,
  onSelect,
}: {
  active: CanvasRailItem | null;
  onSelect: (item: CanvasRailItem) => void;
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
        {RAIL_ITEMS.map(({ id, label, renderIcon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              type="button"
              aria-label={label}
              aria-pressed={isActive}
              onClick={() => onSelect(id)}
              data-testid={`canvas-rail-${id}`}
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
                backgroundColor: isActive
                  ? "var(--color-background-muted)"
                  : "transparent",
                color: isActive
                  ? "var(--color-text-primary)"
                  : "var(--color-text-secondary)",
              }}
            >
              {renderIcon(isActive)}
              <Text
                type="supporting"
                color={isActive ? "primary" : "secondary"}
              >
                {label}
              </Text>
            </button>
          );
        })}
      </VStack>
    </HStack>
  );
}
