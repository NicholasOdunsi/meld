"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { CheckSquare } from "@boxicons/react/CheckSquare";
import { Dashboard } from "@boxicons/react/Dashboard";
import { File } from "@boxicons/react/File";
import { GitBranch } from "@boxicons/react/GitBranch";
import { MessageCircle } from "@boxicons/react/MessageCircle";
import { useRoomTaskStatus } from "@/features/prd/components/room-task-status-provider";
import {
  getRoomSurfaces,
  type RoomSurface,
  type RoomSurfaceState,
} from "../surfaces";

export function RoomTabStrip({
  activeSurface,
  surfaceState,
  basePath,
}: {
  activeSurface: RoomSurface;
  surfaceState: RoomSurfaceState;
  basePath: string;
}) {
  const roomTaskStatus = useRoomTaskStatus();
  const surfaces = getRoomSurfaces({
    ...surfaceState,
    hasPrdTask:
      surfaceState.hasPrdTask || Boolean(roomTaskStatus?.hasPrdTaskSurface),
  });

  if (surfaces.length === 1) return null;

  // Keep the selected chrome aligned with the panel the server has committed.
  // The root LinkProvider handles these hrefs as Next client navigations.
  return (
    <TabList
      value={activeSurface}
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
      {surfaces.includes("user-flows") ? (
        <Tab
          value="user-flows"
          label="User Flows"
          href={`${basePath}?tab=user-flows`}
          icon={<GitBranch pack="basic" size="sm" />}
          selectedIcon={<GitBranch pack="filled" size="sm" />}
        />
      ) : null}
      {surfaces.includes("prd") ? (
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
      {surfaces.includes("decisions") ? (
        <Tab
          value="decisions"
          label="Decisions"
          href={`${basePath}?tab=decisions`}
          icon={<CheckSquare pack="basic" size="sm" />}
          selectedIcon={<CheckSquare pack="filled" size="sm" />}
        />
      ) : null}
      {surfaces.includes("overview") ? (
        <Tab
          value="overview"
          label="Overview"
          href={`${basePath}?tab=overview`}
          icon={<Dashboard pack="basic" size="sm" />}
          selectedIcon={<Dashboard pack="filled" size="sm" />}
        />
      ) : null}
    </TabList>
  );
}
