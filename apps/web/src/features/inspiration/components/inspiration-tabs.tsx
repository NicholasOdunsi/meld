"use client";

import { Tab, TabList } from "@astryxdesign/core/TabList";

export function InspirationTabs({ workspaceId, active }: { workspaceId: string; active: "library" | "taste" }) {
  const base = `/${workspaceId}/inspiration`;
  return (
    <TabList value={active} onChange={() => undefined} aria-label="Inspiration views">
      <Tab value="library" label="Library" href={base} />
      <Tab value="taste" label="Your taste" href={`${base}?tab=taste`} />
    </TabList>
  );
}
