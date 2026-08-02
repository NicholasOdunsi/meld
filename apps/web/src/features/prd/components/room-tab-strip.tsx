"use client";

import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { File } from "@boxicons/react/File";
import { Message } from "@boxicons/react/Message";
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
  // Client Component: TabList requires an `onChange` function prop, which a
  // Server Component cannot pass across the boundary. Navigation is driven by
  // each Tab's href (so a shared link deep-links to the right surface), so
  // onChange is an intentional no-op. Each tab shows an outline icon when
  // inactive and its filled (pack="filled") variant when selected.
  return (
    <TabList value={activeTab} onChange={() => {}} hasDivider size="md">
      <Tab
        value="conversation"
        label="Conversation"
        href={`${basePath}?tab=conversation`}
        icon={<Message pack="basic" size="sm" />}
        selectedIcon={<Message pack="filled" size="sm" />}
      />
      {hasPrd ? (
        <Tab
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
