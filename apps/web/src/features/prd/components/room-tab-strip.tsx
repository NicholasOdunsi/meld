"use client";

import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { File } from "@boxicons/react/File";
import { MessageCircle } from "@boxicons/react/MessageCircle";
import Link from "next/link";
import { useState } from "react";
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
  const [serverTab, setServerTab] = useState<RoomTab>(activeTab);
  const [visualTab, setVisualTab] = useState<RoomTab>(activeTab);

  if (serverTab !== activeTab) {
    setServerTab(activeTab);
    setVisualTab(activeTab);
  }

  // Update the tab chrome immediately, then let the URL-backed Server
  // Component replace the content when it is ready. Resetting local state
  // when the prop changes keeps history and server-side clamping authoritative.
  return (
    <TabList
      value={visualTab}
      onChange={(value) => setVisualTab(value as RoomTab)}
      hasDivider
      size="md"
    >
      <Tab
        as={Link}
        value="conversation"
        label="Conversation"
        href={`${basePath}?tab=conversation`}
        icon={<MessageCircle pack="basic" size="sm" />}
        selectedIcon={<MessageCircle pack="filled" size="sm" />}
      />
      {hasPrd ? (
        <Tab
          as={Link}
          value="prd"
          label="PRD"
          href={`${basePath}?tab=prd`}
          icon={<File pack="basic" size="sm" />}
          selectedIcon={<File pack="filled" size="sm" />}
          endContent={<StatusDot variant="neutral" label="Draft" />}
        />
      ) : null}
    </TabList>
  );
}
