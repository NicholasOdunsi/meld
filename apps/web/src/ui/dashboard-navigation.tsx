"use client";

import { Divider } from "@astryxdesign/core/Divider";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import type { DropdownMenuOption } from "@astryxdesign/core/DropdownMenu";
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
import { Tooltip } from "@astryxdesign/core/Tooltip";
import {
  defineTheme,
  Theme,
} from "@astryxdesign/core/theme";
import { VStack } from "@astryxdesign/core/VStack";
import { At } from "@boxicons/react/At";
import { Buildings } from "@boxicons/react/Buildings";
import { Cog } from "@boxicons/react/Cog";
import { DoorOpen } from "@boxicons/react/DoorOpen";
import { DotsHorizontalRounded } from "@boxicons/react/DotsHorizontalRounded";
import { Home } from "@boxicons/react/Home";
import { LightBulb } from "@boxicons/react/LightBulb";
import { MessageBubbleDots } from "@boxicons/react/MessageBubbleDots";
import { Plus } from "@boxicons/react/Plus";
import { Rocket } from "@boxicons/react/Rocket";
import { Search } from "@boxicons/react/Search";
import { Trash } from "@boxicons/react/Trash";
import { usePathname } from "next/navigation";
import type { CSSProperties } from "react";
import { useState } from "react";
import { CreateRoomDialog } from "@/features/home/components/create-room-dialog";
import { DeleteRoomDialog } from "@/features/discovery/components/delete-room-dialog";

export type DashboardNavigationRoom = {
  id: string;
  name: string;
  ownerId: string;
};

export type DashboardNavigationWorkspace = {
  id: string;
  name: string;
  logoUrl: string | null;
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
  workspaces,
  currentUserId,
  rooms,
}: {
  organizationId: string;
  organizationName: string;
  workspaces: DashboardNavigationWorkspace[];
  currentUserId: string;
  rooms: DashboardNavigationRoom[];
}) {
  const pathname = usePathname();
  const discoveryPath = `/${organizationId}/discovery`;
  const homePath = `/${organizationId}`;
  const settingsPath = `/${organizationId}/settings/members`;
  const [isCreateRoomOpen, setIsCreateRoomOpen] = useState(false);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(
    null,
  );
  const [openMenuRoomId, setOpenMenuRoomId] = useState<string | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] =
    useState<DashboardNavigationRoom | null>(null);

  return (
    <HStack
      gap={0}
      height="100%"
      data-testid="dashboard-navigation"
      style={{
        backgroundColor: "var(--color-background-surface)",
      }}
    >
      {/*
        Opening a room's options menu moves keyboard focus to its first
        enabled item (correct per the ARIA menu pattern), which visually
        reads as "Delete Room" already selected since it's the only enabled
        item. Suppress that specific focus-without-hover state so the menu
        opens neutral; real hover/keyboard-arrow feedback is unaffected.
      */}
      <style>
        {
          ".meld-room-options-menu [role=\"menuitem\"]:focus:not(:hover) { background-color: transparent !important; }"
        }
      </style>
      <SideNav
        collapsible={{
          defaultIsCollapsed: true,
          hasButton: false,
        }}
        data-testid="workspace-rail"
        footerIcons={
          <Tooltip content="Create workspace" placement="end">
            <SideNavItem
              label="Create workspace"
              icon={Plus}
              href="/onboarding"
            />
          </Tooltip>
        }
      >
        <SideNavSection title="Workspaces" isHeaderHidden>
          {workspaces.map((workspace) => (
            <Tooltip
              key={workspace.id}
              content={workspace.name}
              placement="end"
            >
              <SideNavItem
                label={workspace.name}
                icon={<OrganizationLogoIcon logoUrl={workspace.logoUrl} />}
                isSelected={workspace.id === organizationId}
                href={`/${workspace.id}`}
              />
            </Tooltip>
          ))}
        </SideNavSection>
      </SideNav>

      <Divider orientation="vertical" />

      <SideNav
        header={
          <SideNavHeading
            heading={organizationName}
            headingHref={homePath}
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
            href={homePath}
            isSelected={pathname === homePath}
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

        <VStack gap={5} paddingBlock={5} width="100%">
          <SideNavSection
            title="Discovery room navigation"
            isHeaderHidden
          >
            <VStack gap={1} width="100%">
              <HStack
                gap={2}
                style={{
                  paddingInlineStart: "var(--spacing-3)",
                  paddingInlineEnd: "var(--spacing-2)",
                }}
                vAlign="center"
                width="100%"
              >
                <a
                  href={discoveryPath}
                  aria-current={
                    pathname === discoveryPath ? "page" : undefined
                  }
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--spacing-2)",
                    flex: 1,
                    minWidth: 0,
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <Icon
                    icon={MessageBubbleDots}
                    size="sm"
                    color={
                      pathname === discoveryPath ? "primary" : "secondary"
                    }
                    data-testid="discovery-rooms-icon"
                  />
                  <Text
                    type="label"
                  >
                    Discovery Rooms
                  </Text>
                </a>
                <IconButton
                  label="Create Discovery Room"
                  icon={
                    <Icon
                      icon={Plus}
                      size="xsm"
                      data-testid="create-discovery-room-icon"
                    />
                  }
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsCreateRoomOpen(true)}
                />
              </HStack>
              <Theme theme={roomNavigationTheme}>
                <VStack
                  gap={1}
                  paddingBlock={1}
                  width="100%"
                  style={{ paddingInlineStart: "var(--spacing-6)" }}
                >
                  {rooms.map((room) => {
                    const roomPath = `${discoveryPath}/${room.id}`;
                    const isSelected = pathname === roomPath;
                    const isActive =
                      activeRoomId === room.id ||
                      openMenuRoomId === room.id;
                    const menuItems: DropdownMenuOption[] = [
                      {
                        label: "Move to Feature Room",
                        icon: DoorOpen,
                        isDisabled: true,
                      },
                    ];
                    if (room.ownerId === currentUserId) {
                      menuItems.push({
                        label: "Delete Room",
                        icon: Trash,
                        onClick: () => setDeleteTarget(room),
                      });
                    }

                    return (
                      <VStack
                        key={room.id}
                        width="100%"
                        style={{ position: "relative" }}
                        onMouseEnter={() => setActiveRoomId(room.id)}
                        onMouseLeave={() =>
                          setActiveRoomId((current) =>
                            current === room.id ? null : current,
                          )
                        }
                        onFocus={() => setActiveRoomId(room.id)}
                        onBlur={(event) => {
                          if (
                            !event.currentTarget.contains(
                              event.relatedTarget as Node | null,
                            )
                          ) {
                            setActiveRoomId((current) =>
                              current === room.id ? null : current,
                            );
                          }
                        }}
                      >
                        <SideNavItem
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
                        <HStack
                          vAlign="center"
                          style={
                            {
                              position: "absolute",
                              insetBlock: 0,
                              insetInlineEnd: "var(--spacing-1)",
                              opacity: isActive ? 1 : 0,
                            } as CSSProperties
                          }
                        >
                          <DropdownMenu
                            button={{
                              label: `${room.name} options`,
                              icon: (
                                <Icon icon={DotsHorizontalRounded} size="sm" />
                              ),
                              isIconOnly: true,
                              variant: "ghost",
                              size: "sm",
                            }}
                            hasChevron={false}
                            className="meld-room-options-menu"
                            items={menuItems}
                            isMenuOpen={openMenuRoomId === room.id}
                            onOpenChange={(isMenuOpen) =>
                              setOpenMenuRoomId(
                                isMenuOpen ? room.id : null,
                              )
                            }
                          />
                        </HStack>
                      </VStack>
                    );
                  })}
                </VStack>
              </Theme>
            </VStack>
          </SideNavSection>

          <SideNavSection
            title="Feature room navigation"
            isHeaderHidden
          >
            <HStack
              gap={2}
              style={{
                paddingInlineStart: "var(--spacing-3)",
              }}
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

      <CreateRoomDialog
        organizationId={organizationId}
        isOpen={isCreateRoomOpen}
        onOpenChange={setIsCreateRoomOpen}
      />
      {deleteTarget ? (
        <DeleteRoomDialog
          organizationId={organizationId}
          roomId={deleteTarget.id}
          isOpen={deleteTarget !== null}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              setDeleteTarget(null);
            }
          }}
        />
      ) : null}
    </HStack>
  );
}
