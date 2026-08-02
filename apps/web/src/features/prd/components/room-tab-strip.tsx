"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { File } from "@boxicons/react/File";
import { MessageCircle } from "@boxicons/react/MessageCircle";
import { useState } from "react";
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
  const [serverTab, setServerTab] = useState<RoomTab>(activeTab);
  const [visualTab, setVisualTab] = useState<RoomTab>(activeTab);

  if (serverTab !== activeTab) {
    setServerTab(activeTab);
    setVisualTab(activeTab);
  }

  // Update the tab chrome immediately, then let the URL-backed Server
  // Component replace the content when it is ready. Resetting local state
  // when the prop changes keeps history and server-side clamping authoritative.
  // Keep href-backed Tabs on Astryx's native anchor: its custom-link adapter
  // injects a router-style `to` prop that Next Link does not consume reliably.
  return (
    <TabList
      value={visualTab}
      onChange={(value) => setVisualTab(value as RoomTab)}
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
          endContent={<Badge variant="neutral" label="Draft" />}
        />
      ) : null}
    </TabList>
  );
}
