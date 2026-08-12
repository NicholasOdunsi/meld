"use client";

import { Tab, TabList } from "@astryxdesign/core/TabList";
import { usePathname } from "next/navigation";

// AI connections used to be its own top-level rail item; it now lives inside
// Settings, so this strip is what lets people move between the two sections
// without the rail knowing either page exists.
export function SettingsTabs({ workspaceId }: { workspaceId: string }) {
  const pathname = usePathname();
  const membersPath = `/${workspaceId}/settings/members`;
  const devicesPath = `/${workspaceId}/settings/devices`;
  const value = pathname.startsWith(devicesPath) ? "ai-connections" : "members";

  return (
    <TabList value={value} onChange={() => {}} hasDivider>
      <Tab value="members" label="Members" href={membersPath} />
      <Tab value="ai-connections" label="AI connections" href={devicesPath} />
    </TabList>
  );
}
