"use client";

import type { ReactNode } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { StackItem } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { MeldBot } from "@/ui/meld-bot";

// The Canvas's right-edge Agents sidebar: one column that toggles between a
// slim collapsed rail (icon only, click to open -- named via aria-label) and
// the expanded Agents panel (`children`, e.g. the generate/chat composer,
// under a visible "Agents" heading) with its own
// collapse-back control -- never both at once. This is what keeps it
// reading as a single collapsible sidebar rather than a permanent rail plus
// a second panel appearing beside it: collapsed, it costs the rail's own
// slim width; expanded, it costs only the panel's width, not both summed --
// so opening it never eats more canvas space than the panel actually needs.
//
// Same surface + attachment as the app's own sidebar (`workspace-navigation`
// `data-testid="workspace-rail"`): `--color-background-surface` fill with a
// vertical `Divider` seam instead of a floating bordered/shadowed `Card`, so
// this reads as part of the canvas's chrome rather than an overlay on top of
// it.
export function CanvasAgentSidebar({
  isOpen,
  onToggle,
  children,
}: {
  isOpen: boolean;
  onToggle: () => void;
  children?: ReactNode;
}) {
  return (
    <HStack
      gap={0}
      height="100%"
      data-testid="canvas-agent-sidebar"
      style={{ backgroundColor: "var(--color-background-surface)" }}
    >
      <Divider orientation="vertical" />
      {isOpen ? (
        // The expanded panel drops to the darker --color-background-body so
        // the composer (which paints itself with the lighter surface color)
        // reads as a raised input against it, the way a chat surface's
        // composer sits raised on its page. The collapsed rail keeps the
        // HStack root's surface color, matching the app's own sidebar chrome.
        <VStack
          width="100%"
          height="100%"
          style={{
            overflow: "hidden",
            backgroundColor: "var(--color-background-body)",
          }}
        >
          <HStack
            vAlign="center"
            justify="between"
            style={{ padding: "var(--spacing-2) var(--spacing-3)" }}
          >
            <HStack gap={2} vAlign="center">
              <MeldBot variant="design" appearance="head" width={20} height={20} />
              <Text type="label" weight="medium">Agents</Text>
            </HStack>
            <Button
              label="Collapse Agents panel"
              variant="ghost"
              size="sm"
              isIconOnly
              // The DS's semantic "viewColumns" glyph -- a two-panel layout
              // rectangle -- reads as a sidebar-collapse control the way a
              // plain "×" close glyph doesn't (this panel isn't dismissed,
              // it collapses back into the rail).
              icon={<Icon icon="viewColumns" size="sm" />}
              onClick={onToggle}
            />
          </HStack>
          <Divider />
          {/* Fills the remaining height below the header so ScreenComposer's
              own height:100% resolves against actual available space --
              ScreenComposer then splits that internally into a scrollable
              screens list plus a composer bar pinned at its own bottom. */}
          <StackItem size="fill" style={{ width: "100%", minHeight: "var(--spacing-0)" }}>
            {children}
          </StackItem>
        </VStack>
      ) : (
        <VStack
          gap={2}
          width="100%"
          style={{
            paddingBlock: "var(--spacing-2)",
            paddingInline: "var(--spacing-0)",
          }}
        >
          <button
            type="button"
            aria-label="Agents"
            aria-pressed={false}
            onClick={onToggle}
            data-testid="canvas-rail-agents"
            style={{
              all: "unset",
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "var(--spacing-1)",
              width: "100%",
              padding: "var(--spacing-1) 8px",
              borderRadius: "var(--radius-element)",
              cursor: "pointer",
              color: "var(--color-text-secondary)",
            }}
          >
            {/* Our agent mascot (MeldBot), not the pixel-icon set -- in the
                design-agent color so it reads apart from the product/research
                agents shown elsewhere (room header roster). Icon-only: the
                "Agents" label lives in the button's aria-label instead of
                visible text, keeping the collapsed rail as slim as possible. */}
            <MeldBot variant="design" appearance="head" width={20} height={20} />
          </button>
        </VStack>
      )}
    </HStack>
  );
}
