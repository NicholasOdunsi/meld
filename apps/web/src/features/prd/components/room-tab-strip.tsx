"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { File } from "@boxicons/react/File";
import { MessageCircle } from "@boxicons/react/MessageCircle";
import { useRoomTaskStatus } from "./room-task-status-provider";
import type { RoomTab } from "./room-tabs";

export function RoomTabStrip({
  activeTab,
  hasPrd,
  basePath,
}: {
  activeTab: RoomTab;
  hasPrd: boolean;
  basePath: string;
}) {
  const roomTaskStatus = useRoomTaskStatus();

  // Keep the selected chrome aligned with the panel the server has committed.
  // The root LinkProvider handles these hrefs as Next client navigations.
  return (
    <TabList
      value={activeTab}
      onChange={() => undefined}
      hasDivider
      size="md"
    >
      <Tab
        value="conversation"
        label="Conversation"
        href={`${basePath}?tab=conversation`}
        icon={<MessageCircle pack="basic" size="sm" />}
        selectedIcon={<MessageCircle pack="filled" size="sm" />}
      />
      {hasPrd ||
      roomTaskStatus?.hasPrdTaskSurface ||
      (activeTab === "prd" && roomTaskStatus?.isInitialLoading) ? (
        <Tab
          value="prd"
          label="PRD"
          href={`${basePath}?tab=prd`}
          icon={<File pack="basic" size="sm" />}
          selectedIcon={<File pack="filled" size="sm" />}
          endContent={
            <Badge
              variant="neutral"
              label={roomTaskStatus?.prdStatus === "accepted" ? "Accepted" : "Draft"}
            />
          }
        />
      ) : null}
    </TabList>
  );
}
