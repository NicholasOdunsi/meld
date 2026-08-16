"use client";

import { List, ListItem } from "@astryxdesign/core/List";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { ReactNode } from "react";

// The starter glyphs are inlined as SVG rather than <img src="/public/...">
// so they ship in the bundle and paint with the rows instead of each being a
// separate network request that flashes in after render. Same hand-authored
// pixel-art style as the conversation starters (16x16, crispEdges, #F1F0ED
// outline + one accent), rendered at 20px -- smaller than the conversation's
// 32px since the Agents panel is narrow.
const ICON_SIZE = 20;

function DesignSystemGlyph() {
  return (
    <svg
      width={ICON_SIZE}
      height={ICON_SIZE}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <path
        d="M2 2H14V14H2V2Z"
        stroke="#F1F0ED"
        strokeWidth="1"
        strokeLinejoin="miter"
      />
      <rect x="4" y="4" width="3" height="3" fill="#8B6BFF" />
      <rect x="9" y="4" width="3" height="3" fill="#8B6BFF" />
      <rect x="4" y="9" width="3" height="3" fill="#8B6BFF" />
      <rect x="9" y="9" width="3" height="3" fill="#8B6BFF" />
    </svg>
  );
}

function PrototypeGlyph() {
  return (
    <svg
      width={ICON_SIZE}
      height={ICON_SIZE}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <path
        d="M2 2H14V13H2V2Z"
        stroke="#F1F0ED"
        strokeWidth="1"
        strokeLinejoin="miter"
      />
      <path d="M2 5H14" stroke="#F1F0ED" strokeWidth="1" />
      <rect x="4" y="3" width="1" height="1" fill="#3ECFE0" />
      <rect x="6" y="3" width="1" height="1" fill="#3ECFE0" />
      <rect x="4" y="7" width="8" height="1" fill="#3ECFE0" />
      <rect x="4" y="9" width="8" height="1" fill="#3ECFE0" />
      <rect x="4" y="11" width="5" height="1" fill="#3ECFE0" />
    </svg>
  );
}

function SketchGlyph() {
  return (
    <svg
      width={ICON_SIZE}
      height={ICON_SIZE}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <path
        d="M11 2L14 5L5 14H2V11L11 2Z"
        stroke="#F1F0ED"
        strokeWidth="1"
        strokeLinejoin="miter"
      />
      <path d="M9 4L12 7" stroke="#F1F0ED" strokeWidth="1" />
      <path d="M2 12L2 14H4L2 12Z" fill="#FB9A3E" />
    </svg>
  );
}

type AgentStarter = {
  label: string;
  icon: ReactNode;
  // What clicking the row does: prefill drops the partial instruction into the
  // composer; upload opens the design-system file picker instead.
  action: { kind: "prefill"; prompt: string } | { kind: "upload" };
};

// Short labels only -- the Agents panel is narrow, so descriptions would wrap
// one-word-per-line. The pixel icon carries the visual weight instead.
const STARTERS: readonly AgentStarter[] = [
  {
    label: "Add a design system",
    icon: <DesignSystemGlyph />,
    action: { kind: "upload" },
  },
  {
    label: "Create a prototype",
    icon: <PrototypeGlyph />,
    action: { kind: "prefill", prompt: "Create a screen for " },
  },
  {
    label: "Sketch a screen",
    icon: <SketchGlyph />,
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
            startContent={starter.icon}
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
