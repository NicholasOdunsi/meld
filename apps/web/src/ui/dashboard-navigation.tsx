"use client";

import { Divider } from "@astryxdesign/core/Divider";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { HStack } from "@astryxdesign/core/HStack";
import {
  SideNav,
  SideNavHeading,
  SideNavItem,
  SideNavSection,
} from "@astryxdesign/core/SideNav";
import { At } from "@boxicons/react/At";
import { Buildings } from "@boxicons/react/Buildings";
import { Cog } from "@boxicons/react/Cog";
import { Hashtag } from "@boxicons/react/Hashtag";
import { Home } from "@boxicons/react/Home";
import { Plus } from "@boxicons/react/Plus";
import { Search } from "@boxicons/react/Search";
import { usePathname, useRouter } from "next/navigation";

export type DashboardNavigationRoom = {
  id: string;
  name: string;
};

export function DashboardNavigation({
  organizationId,
  organizationName,
  rooms,
}: {
  organizationId: string;
  organizationName: string;
  rooms: DashboardNavigationRoom[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const discoveryPath = `/${organizationId}/discovery`;
  const settingsPath = `/${organizationId}/settings/members`;

  return (
    <HStack gap={0} height="100%">
      <SideNav
        collapsible={{
          defaultIsCollapsed: true,
          hasButton: false,
        }}
        data-testid="workspace-rail"
      >
        <SideNavSection title="Workspaces" isHeaderHidden>
          <SideNavItem
            label={organizationName}
            icon={Buildings}
            selectedIcon={Buildings}
            isSelected
            href={discoveryPath}
          />
          <SideNavItem
            label="Create workspace"
            icon={Plus}
            href="/onboarding"
          />
        </SideNavSection>
      </SideNav>

      <Divider orientation="vertical" />

      <SideNav
        header={
          <SideNavHeading
            heading={organizationName}
            headingHref={discoveryPath}
          />
        }
        resizable={{
          defaultWidth: 256,
          minWidth: 220,
          maxWidth: 320,
          autoSaveId: "meld-dashboard-side-nav",
        }}
        data-testid="dashboard-side-nav"
      >
        <SideNavSection title="Primary" isHeaderHidden>
          <SideNavItem
            label="Home"
            icon={Home}
            selectedIcon={Home}
            href={discoveryPath}
            isSelected={pathname === discoveryPath}
          />
          <SideNavItem
            label="Search"
            icon={Search}
            isDisabled
          />
          <SideNavItem label="Mentions" icon={At} isDisabled />
          <SideNavItem
            label="Settings"
            icon={Cog}
            selectedIcon={Cog}
            href={settingsPath}
            isSelected={pathname.startsWith(
              `/${organizationId}/settings`,
            )}
          />
        </SideNavSection>

        <SideNavSection
          title="Discovery Rooms"
          endContent={
            <IconButton
              label="Create Discovery Room"
              icon={<Icon icon={Plus} />}
              variant="ghost"
              size="sm"
              tooltip="Create Discovery Room"
              onClick={() => router.push(discoveryPath)}
            />
          }
        >
          {rooms.map((room) => {
            const roomPath = `${discoveryPath}/${room.id}`;
            return (
              <SideNavItem
                key={room.id}
                label={room.name}
                icon={Hashtag}
                selectedIcon={Hashtag}
                href={roomPath}
                isSelected={pathname === roomPath}
              />
            );
          })}
        </SideNavSection>

        <SideNavSection
          title="Feature Rooms"
          endContent={
            <IconButton
              label="Create Feature Room"
              icon={<Icon icon={Plus} />}
              variant="ghost"
              size="sm"
              tooltip="Feature Rooms come from accepted PRDs"
              isDisabled
            />
          }
        >
          {null}
        </SideNavSection>
      </SideNav>
    </HStack>
  );
}
