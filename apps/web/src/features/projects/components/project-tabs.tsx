"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Tab, TabList, TabMenu } from "@astryxdesign/core/TabList";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useWorkspaceActivity } from "@/features/activity/workspace-activity-provider";
import { ProjectStatusMark } from "@/features/activity/components/project-status-mark";
import { PixelPlus as Plus } from "@/ui/pixel-icons";
import { actionErrorMessage } from "@/ui/action-error";
import { createProjectTab } from "../actions";
import { PROJECT_COLOR_VARS, PROJECT_ICON_COMPONENTS } from "../project-icons";
import type { ProjectSummary } from "../schemas";

// Apple HIG (Tab views): no more than six visible tabs; the rest collect in
// a "More" menu at the end of the bar.
export const MAX_VISIBLE_PROJECT_TABS = 6;

export type ProjectTab = { id: string; name: string };

// Which tabs show inline and which go into "More". The selected tab is always
// kept visible -- if it would overflow, it takes the last inline slot.
export function splitProjectTabs(
  tabs: readonly ProjectTab[],
  selectedId: string,
  max = MAX_VISIBLE_PROJECT_TABS,
): { visible: ProjectTab[]; overflow: ProjectTab[] } {
  if (tabs.length <= max) return { visible: [...tabs], overflow: [] };
  const visible = tabs.slice(0, max);
  const selected = tabs.find((tab) => tab.id === selectedId);
  if (selected && !visible.includes(selected)) {
    visible[max - 1] = selected;
  }
  return {
    visible,
    overflow: tabs.filter((tab) => !visible.includes(tab)),
  };
}

// The project's chat tabs, oldest (Main) first. Each tab is a room; "+"
// opens a new chat straight away, no dialog.
export function ProjectTabs({
  workspaceId,
  project,
  tabs,
  selectedRoomId,
}: {
  workspaceId: string;
  project: ProjectSummary;
  tabs: ProjectTab[];
  selectedRoomId: string;
}) {
  const router = useRouter();
  const { byRoom } = useWorkspaceActivity();
  const [error, setError] = useState<string | null>(null);
  const { visible, overflow } = splitProjectTabs(tabs, selectedRoomId);
  const roomHref = (roomId: string) => `/${workspaceId}/rooms/${roomId}`;
  const ProjectGlyph = PROJECT_ICON_COMPONENTS[project.icon];

  async function openNewTab() {
    setError(null);
    try {
      const result = await createProjectTab({
        workspaceId,
        projectId: project.id,
      });
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      router.push(roomHref(result.roomId));
    } catch (thrown) {
      setError(actionErrorMessage(thrown, "We could not open a new tab."));
    }
  }

  return (
    <VStack gap={0} width="100%" data-testid="project-tabs">
      <HStack
        gap={3}
        vAlign="center"
        paddingInline={4}
        width="100%"
        style={{ paddingBlockStart: "var(--spacing-2)" }}
      >
        <HStack gap={2} vAlign="center" style={{ flexShrink: 0 }}>
          <ProjectGlyph
            pack="filled"
            size="xs"
            fill={PROJECT_COLOR_VARS[project.color]}
            aria-hidden="true"
          />
          <Text type="label" weight="semibold">
            {project.name}
          </Text>
        </HStack>
        <HStack gap={3} vAlign="end" style={{ flex: 1, minWidth: 0 }}>
          <TabList
            aria-label={`${project.name} chats`}
            value={selectedRoomId}
            onChange={(roomId) => router.push(roomHref(roomId))}
            size="md"
          >
            {visible.map((tab) => (
              <Tab
                key={tab.id}
                value={tab.id}
                label={tab.name}
                href={roomHref(tab.id)}
                icon={(() => {
                  const room = byRoom.get(tab.id);
                  if (!room || room.state === "idle") return undefined;
                  return (
                    <ProjectStatusMark
                      name={tab.name}
                      color={PROJECT_COLOR_VARS[project.color]}
                      state={room.state}
                      room={room}
                      hop={false}
                      fallback={null}
                    />
                  );
                })()}
              />
            ))}
            {overflow.length > 0 ? (
              <TabMenu
                label="More"
                options={overflow.map((tab) => ({
                  value: tab.id,
                  label: tab.name,
                }))}
              />
            ) : null}
          </TabList>
          <IconButton
            label="New chat tab"
            tooltip="New chat tab"
            icon={<Icon icon={Plus} size="sm" />}
            variant="ghost"
            size="md"
            clickAction={openNewTab}
          />
        </HStack>
      </HStack>
      {error ? <Banner status="error" title={error} /> : null}
    </VStack>
  );
}
