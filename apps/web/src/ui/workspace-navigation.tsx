"use client";

import { Divider } from "@astryxdesign/core/Divider";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import {
  SideNav,
  SideNavHeading,
  SideNavItem,
  SideNavSection,
} from "@astryxdesign/core/SideNav";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { VStack } from "@astryxdesign/core/VStack";
import {
  PixelAt as At,
  PixelBank as Buildings,
  PixelCog as Cog,
  PixelHome as Home,
  PixelPaintBrush as PaintBrush,
  PixelPlus as Plus,
  PixelSearch as Search,
} from "@/ui/pixel-icons";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ProjectRoomNavigation,
  type ProjectNavigationRoom,
} from "@/features/projects/components/project-room-navigation";
import type { ProjectSummary } from "@/features/projects/schemas";
import { useRoomLifecycleRealtime } from "@/features/rooms/use-room-lifecycle-realtime";

export type WorkspaceNavigationWorkspace = {
  id: string;
  name: string;
  logoUrl: string | null;
  // Whether something in that workspace is waiting on this member. A bare
  // boolean on purpose: the rail is allowed to say that attention exists
  // elsewhere, and nothing about the Room, message, or client behind it.
  hasAttention: boolean;
};

function WorkspaceLogoIcon({ logoUrl }: { logoUrl?: string | null }) {
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);

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
      data-testid="workspace-logo"
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

// What a waiting workspace is called. The rail stays collapsed, so its items
// label their own anchor, and an element with an aria-label is named by that
// label alone -- assistive technology never descends into it. The attention
// therefore has to be part of the item's name; a label on the dot nested
// inside it would be silently dropped.
function workspaceRailLabel(workspace: WorkspaceNavigationWorkspace) {
  return workspace.hasAttention
    ? `${workspace.name} needs attention`
    : workspace.name;
}

// The dot is what makes attention noticeable at a glance, and the name above
// is what makes it perceivable without color. Since that name already carries
// the whole message, the dot is decorative and stays out of the announcement.
function WorkspaceRailIcon({
  name,
  logoUrl,
  hasAttention,
}: {
  name: string;
  logoUrl: string | null;
  hasAttention: boolean;
}) {
  return (
    <HStack vAlign="center" style={{ position: "relative" }}>
      <WorkspaceLogoIcon logoUrl={logoUrl} />
      {hasAttention ? (
        <StatusDot
          variant="accent"
          label={`${name} needs attention`}
          aria-hidden="true"
          data-testid="workspace-attention"
          style={{
            insetBlockStart: "calc(var(--spacing-1) * -1)",
            insetInlineEnd: "calc(var(--spacing-1) * -1)",
            position: "absolute",
          }}
        />
      ) : null}
    </HStack>
  );
}

export function WorkspaceNavigation({
  workspaceId,
  workspaceName,
  workspaces,
  currentUserId,
  isWorkspaceAdmin,
  projects,
  rooms,
  lifecycleRealtimeEnabled = false,
}: {
  workspaceId: string;
  workspaceName: string;
  workspaces: WorkspaceNavigationWorkspace[];
  currentUserId: string;
  isWorkspaceAdmin: boolean;
  projects: ProjectSummary[];
  rooms: ProjectNavigationRoom[];
  lifecycleRealtimeEnabled?: boolean;
}) {
  const pathname = usePathname();
  const homePath = `/${workspaceId}`;
  const designSystemPath = `/${workspaceId}/design-system`;
  const settingsPath = `/${workspaceId}/settings/members`;
  const initialLifecycleRooms = useMemo(
    () =>
      rooms.map((room) => ({
        ...room,
        workspaceId,
      })),
    [rooms, workspaceId],
  );
  const lifecycleRooms = useRoomLifecycleRealtime(
    { workspaceId },
    initialLifecycleRooms,
    lifecycleRealtimeEnabled,
  );

  return (
    <HStack
      gap={0}
      height="100%"
      data-testid="workspace-navigation"
      style={{ backgroundColor: "var(--color-background-surface)" }}
    >
      <SideNav
        collapsible={{ defaultIsCollapsed: true, hasButton: false }}
        data-testid="workspace-rail"
      >
        <SideNavSection title="Workspaces" isHeaderHidden>
          <VStack gap={2} data-testid="workspace-links">
            {workspaces.map((workspace) => (
              <Tooltip
                key={workspace.id}
                content={workspaceRailLabel(workspace)}
                placement="end"
              >
                <SideNavItem
                  label={workspaceRailLabel(workspace)}
                  icon={
                    <WorkspaceRailIcon
                      name={workspace.name}
                      logoUrl={workspace.logoUrl}
                      hasAttention={workspace.hasAttention}
                    />
                  }
                  isSelected={workspace.id === workspaceId}
                  href={`/${workspace.id}`}
                />
              </Tooltip>
            ))}
            {/* Pinned right under the workspace list it belongs to, not down
                in a page-level footer. */}
            <Tooltip content="Create workspace" placement="end">
              <SideNavItem
                label="Create workspace"
                icon={Plus}
                href="/onboarding"
              />
            </Tooltip>
          </VStack>
        </SideNavSection>
      </SideNav>

      <Divider orientation="vertical" />

      <SideNav
        header={
          <SideNavHeading heading={workspaceName} headingHref={homePath} />
        }
        resizable={{ defaultWidth: 256, minWidth: 220, maxWidth: 320 }}
        data-testid="workspace-side-nav"
      >
        <SideNavSection title="Primary" isHeaderHidden>
          <SideNavItem
            label="Home"
            icon={Home}
            selectedIcon={Home}
            href={homePath}
            isSelected={pathname === homePath}
          />
          {/* Not wired up yet -- no href/onClick, so the item is inert
              rather than disabled. Shown at full strength (not dimmed) so
              people can see what's coming instead of it looking broken. */}
          <SideNavItem label="Search" icon={Search} />
          <SideNavItem label="Mentions" icon={At} />
          <SideNavItem
            label="Design System"
            icon={PaintBrush}
            selectedIcon={PaintBrush}
            href={designSystemPath}
            isSelected={pathname.startsWith(designSystemPath)}
          />
          <SideNavItem
            label="Settings"
            icon={Cog}
            selectedIcon={Cog}
            href={settingsPath}
            isSelected={pathname.startsWith(settingsPath)}
          />
        </SideNavSection>

        <VStack paddingBlock={2}>
          <Divider isFullBleed />
        </VStack>

        <ProjectRoomNavigation
          key={workspaceId}
          workspaceId={workspaceId}
          projects={projects}
          rooms={lifecycleRooms}
          currentUserId={currentUserId}
          isWorkspaceAdmin={isWorkspaceAdmin}
        />
      </SideNav>
    </HStack>
  );
}
