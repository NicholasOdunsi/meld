"use client";

import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { IconButton } from "@astryxdesign/core/IconButton";
import { ToggleButton, ToggleButtonGroup } from "@astryxdesign/core/ToggleButton";
import { VStack } from "@astryxdesign/core/VStack";
import { TOOL_ICONS } from "./tool-icons";
import { DOCK_TOOLS, type DockTool } from "./tools";

// Orion's tool column down the left edge of the board. It drives Excalidraw
// through the imperative API; Excalidraw's own toolbar is hidden.
export function CanvasDock({ activeTool, onSelectTool, onCode, isDisabled }: {
  activeTool: DockTool | null;
  onSelectTool: (tool: DockTool) => void;
  onCode?: () => void;
  isDisabled?: boolean;
}) {
  const CodeIcon = TOOL_ICONS.code;
  return (
    <Card
      padding={1}
      data-testid="canvas-dock"
      style={{ position: "absolute", insetInlineStart: "var(--spacing-3)", top: "50%", transform: "translateY(-50%)", zIndex: 5 }}
    >
      <VStack gap={1} align="center">
        <ToggleButtonGroup
          label="Canvas tools"
          orientation="vertical"
          size="sm"
          value={activeTool}
          isDisabled={isDisabled}
          onChange={(value) => { if (typeof value === "string") onSelectTool(value as DockTool); }}
        >
          {DOCK_TOOLS.map(({ tool, label, shortcut }) => {
            const Icon = TOOL_ICONS[tool];
            return <ToggleButton key={tool} value={tool} label={label} tooltip={`${label} · ${shortcut}`} isIconOnly icon={<Icon width="1em" height="1em" />} />;
          })}
        </ToggleButtonGroup>
        {onCode ? (
          <>
            <Divider />
            <IconButton label="Code" tooltip="Paste code or start a screen" variant="ghost" size="sm" icon={<CodeIcon width="1em" height="1em" />} onClick={onCode} isDisabled={isDisabled} />
          </>
        ) : null}
      </VStack>
    </Card>
  );
}
