"use client";

import { useState } from "react";
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack } from "@astryxdesign/core/HStack";
import { Popover } from "@astryxdesign/core/Popover";
import { ToggleButton } from "@astryxdesign/core/ToggleButton";
import { VStack } from "@astryxdesign/core/VStack";
import { TOOL_ICONS } from "./tool-icons";
import { DOCK_GROUPS, DOCK_TOOLS, isShapeTool, SHAPE_TOOLS, type DockTool, type ShapeTool } from "./tools";

const ICON_SIZE = "1.25em";
const ENTRY = new Map(DOCK_TOOLS.map((entry) => [entry.tool, entry]));
const tooltipFor = (tool: DockTool) => `${ENTRY.get(tool)!.label} · ${ENTRY.get(tool)!.shortcut}`;

// Orion's tool column down the left edge of the board. It drives Excalidraw
// through the imperative API; Excalidraw's own toolbar is hidden.
export function CanvasDock({ activeTool, onSelectTool, onCode, isDisabled }: {
  activeTool: DockTool | null;
  onSelectTool: (tool: DockTool) => void;
  onCode?: () => void;
  isDisabled?: boolean;
}) {
  const [shapesOpen, setShapesOpen] = useState(false);
  // The Shapes button shows the shape you used last, so a repeat is one look away.
  const [lastShape, setLastShape] = useState<ShapeTool>("rectangle");
  if (isShapeTool(activeTool) && activeTool !== lastShape) setLastShape(activeTool);
  const CodeIcon = TOOL_ICONS.code;
  const ShapesIcon = TOOL_ICONS[lastShape];

  const toolButton = (tool: DockTool) => {
    const Icon = TOOL_ICONS[tool];
    const { label } = ENTRY.get(tool)!;
    return (
      <ToggleButton
        key={tool}
        label={label}
        tooltip={tooltipFor(tool)}
        isIconOnly
        isDisabled={isDisabled}
        isPressed={activeTool === tool}
        onPressedChange={() => onSelectTool(tool)}
        icon={<Icon width={ICON_SIZE} height={ICON_SIZE} />}
      />
    );
  };

  return (
    <Card padding={1.5} data-testid="canvas-dock" className="orion-dock">
      <VStack gap={1} align="center">
        {DOCK_GROUPS.map((group, index) => (
          <VStack key={index} gap={1} align="center">
            {index > 0 ? <Divider /> : null}
            {group.map((entry) => entry === "shapes" ? (
              <Popover
                key="shapes"
                placement="end"
                alignment="center"
                label="Shapes"
                isOpen={shapesOpen}
                onOpenChange={setShapesOpen}
                content={(
                  <HStack gap={1}>
                    {SHAPE_TOOLS.map((tool) => {
                      const Icon = TOOL_ICONS[tool];
                      const { label } = ENTRY.get(tool)!;
                      return (
                        <ToggleButton
                          key={tool}
                          label={label}
                          tooltip={tooltipFor(tool)}
                          isIconOnly
                          isPressed={activeTool === tool}
                          onPressedChange={() => { onSelectTool(tool); setShapesOpen(false); }}
                          icon={<Icon width={ICON_SIZE} height={ICON_SIZE} />}
                        />
                      );
                    })}
                  </HStack>
                )}
              >
                <ToggleButton
                  label="Shapes"
                  tooltip="Shapes · R, O, A"
                  isIconOnly
                  isDisabled={isDisabled}
                  isPressed={isShapeTool(activeTool)}
                  icon={<ShapesIcon width={ICON_SIZE} height={ICON_SIZE} />}
                />
              </Popover>
            ) : toolButton(entry))}
          </VStack>
        ))}
        {onCode ? (
          <>
            <Divider />
            <ToggleButton label="Code" tooltip="Paste code or start a screen" isIconOnly isDisabled={isDisabled} isPressed={false} onPressedChange={onCode} icon={<CodeIcon width={ICON_SIZE} height={ICON_SIZE} />} />
          </>
        ) : null}
      </VStack>
    </Card>
  );
}
