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
import { StackItem } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import {
  defineTheme,
  Theme,
} from "@astryxdesign/core/theme";
import { VStack } from "@astryxdesign/core/VStack";
import { At } from "@boxicons/react/At";
import { Buildings } from "@boxicons/react/Buildings";
import { Cog } from "@boxicons/react/Cog";
import { Home } from "@boxicons/react/Home";
import { LightBulb } from "@boxicons/react/LightBulb";
import { MessageBubbleDots } from "@boxicons/react/MessageBubbleDots";
import { Plus } from "@boxicons/react/Plus";
import { Rocket } from "@boxicons/react/Rocket";
import { Search } from "@boxicons/react/Search";
import { usePathname } from "next/navigation";
import { useState } from "react";

export type DashboardNavigationRoom = {
  id: string;
  name: string;
};

const roomNavigationTheme = defineTheme({
  name: "meld-room-navigation",
  components: {
    "side-nav-item": {
      "size:sm": {
        color: "var(--color-text-secondary)",
      },
      selected: {
        color: "var(--color-text-primary)",
      },
    },
  },
});

function OrganizationLogoIcon({
  logoUrl,
}: {
  logoUrl?: string | null;
}) {
  const [failedLogoUrl, setFailedLogoUrl] = useState<
    string | null
  >(null);

  if (!logoUrl || failedLogoUrl === logoUrl) {
    return <Icon icon={Buildings} size="sm" />;
  }

  return (
    // A storage-backed logo can come from any configured Supabase host.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt=""
      aria-hidden="true"
      data-testid="organization-logo"
      onError={() => setFailedLogoUrl(logoUrl)}
      style={{
        blockSize: "var(--spacing-5)",
        borderRadius: "var(--radius-element)",
        inlineSize: "var(--spacing-5)",
        objectFit: "cover",
      }}
    />
  );
}

export function DashboardNavigation({
  organizationId,
  organizationName,
  organizationLogoUrl,
  rooms,
}: {
  organizationId: string;
  organizationName: string;
  organizationLogoUrl?: string | null;
  rooms: DashboardNavigationRoom[];
}) {
  const pathname = usePathname();
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
            icon={
              <OrganizationLogoIcon logoUrl={organizationLogoUrl} />
            }
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

        <VStack gap={5} paddingBlock={5}>
          <SideNavSection
            title="Discovery room navigation"
            isHeaderHidden
          >
            <SideNavItem
              label="Discovery Rooms"
              icon={
                <Icon
                  icon={MessageBubbleDots}
                  size="sm"
                  color={
                    pathname === discoveryPath
                      ? "primary"
                      : "secondary"
                  }
                  data-testid="discovery-rooms-icon"
                />
              }
              href={discoveryPath}
              isSelected={pathname === discoveryPath}
              collapsible={false}
              endContent={
                <Icon
                  icon={Plus}
                  size="xsm"
                  color="secondary"
                  data-testid="create-discovery-room-icon"
                />
              }
            >
              <Theme theme={roomNavigationTheme}>
                {rooms.map((room) => {
                  const roomPath = `${discoveryPath}/${room.id}`;
                  const isSelected = pathname === roomPath;

                  return (
                    <SideNavItem
                      key={room.id}
                      label={room.name}
                      icon={
                        <Icon
                          icon={LightBulb}
                          size="sm"
                          color={
                            isSelected ? "primary" : "secondary"
                          }
                          data-testid="discovery-room-icon"
                        />
                      }
                      href={roomPath}
                      isSelected={isSelected}
                      size="sm"
                    />
                  );
                })}
              </Theme>
            </SideNavItem>
          </SideNavSection>

          <SideNavSection
            title="Feature room navigation"
            isHeaderHidden
          >
            <HStack
              gap={2}
              paddingInline={3}
              vAlign="center"
              width="100%"
            >
              <Icon
                icon={Rocket}
                size="sm"
                color="secondary"
                data-testid="feature-rooms-icon"
              />
              <StackItem size="fill">
                <Text type="label">Feature Rooms</Text>
              </StackItem>
              <IconButton
                label="Create Feature Room"
                icon={
                  <Icon
                    icon={Plus}
                    size="xsm"
                    data-testid="create-feature-room-icon"
                  />
                }
                variant="ghost"
                size="sm"
                tooltip="Feature Rooms come from accepted PRDs"
                isDisabled
              />
            </HStack>
            {null}
          </SideNavSection>
        </VStack>
      </SideNav>
    </HStack>
  );
}
