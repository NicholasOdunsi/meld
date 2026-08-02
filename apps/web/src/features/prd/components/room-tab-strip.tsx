import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Tab, TabList } from "@astryxdesign/core/TabList";

export type RoomTab = "conversation" | "prd";

export function parseRoomTab(
  raw: string | undefined,
  hasPrd: boolean,
): RoomTab {
  if (raw === "prd" && hasPrd) return "prd";
  return "conversation";
}

export function RoomTabStrip({
  activeTab,
  hasPrd,
  basePath,
}: {
  activeTab: RoomTab;
  hasPrd: boolean;
  basePath: string;
}) {
  // TabList is controlled by `value`; navigation is via each Tab's href so a
  // shared link deep-links to the right surface. onChange is a required prop but
  // the href drives the actual navigation, so it is a no-op here.
  return (
    <TabList value={activeTab} onChange={() => {}} hasDivider size="md">
      <Tab
        value="conversation"
        label="Conversation"
        href={`${basePath}?tab=conversation`}
      />
      {hasPrd ? (
        <Tab
          value="prd"
          label="PRD"
          href={`${basePath}?tab=prd`}
          endContent={<StatusDot variant="neutral" label="Draft" />}
        />
      ) : null}
    </TabList>
  );
}
