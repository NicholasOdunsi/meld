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
import { At } from "@boxicons/react/At";
import { Buildings } from "@boxicons/react/Buildings";
import { Chip } from "@boxicons/react/Chip";
import { Cog } from "@boxicons/react/Cog";
import { Home } from "@boxicons/react/Home";
import { Plus } from "@boxicons/react/Plus";
import { Search } from "@boxicons/react/Search";
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

// The rail stays collapsed, so the workspace icon is the only place an
// attention signal can live. The dot carries its own accessible label rather
// than relying on color, and that label names the workspace and nothing else.
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
  const settingsPath = `/${workspaceId}/settings/members`;
  const aiConnectionsPath = `/${workspaceId}/settings/devices`;
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
        footer={
          <VStack data-testid="workspace-rail-footer">
            <SideNavSection title="Create workspace" isHeaderHidden>
              <Tooltip content="Create workspace" placement="end">
                <SideNavItem
                  label="Create workspace"
                  icon={Plus}
                  href="/onboarding"
                />
              </Tooltip>
            </SideNavSection>
          </VStack>
        }
        data-testid="workspace-rail"
      >
        <SideNavSection title="Workspaces" isHeaderHidden>
          <VStack gap={2} data-testid="workspace-links">
            {workspaces.map((workspace) => (
              <Tooltip
                key={workspace.id}
                content={workspace.name}
                placement="end"
              >
                <SideNavItem
                  label={workspace.name}
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
          <SideNavItem label="Search" icon={Search} isDisabled />
          <SideNavItem label="Mentions" icon={At} isDisabled />
          <SideNavItem
            label="AI connections"
            icon={Chip}
            selectedIcon={Chip}
            href={aiConnectionsPath}
            isSelected={pathname.startsWith(aiConnectionsPath)}
          />
          <SideNavItem
            label="Settings"
            icon={Cog}
            selectedIcon={Cog}
            href={settingsPath}
            isSelected={pathname.startsWith(settingsPath)}
          />
        </SideNavSection>

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
