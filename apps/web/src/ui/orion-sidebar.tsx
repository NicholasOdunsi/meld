"use client";

import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { Icon } from "@astryxdesign/core/Icon";
import {
  SideNav,
  SideNavCollapseButton,
  SideNavHeading,
  SideNavItem,
  SideNavSection,
  type SideNavImperativeCollapseHandle,
} from "@astryxdesign/core/SideNav";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useWorkspaceActivity } from "@/features/activity/workspace-activity-provider";
import { ProjectStatusMark } from "@/features/activity/components/project-status-mark";
import { CreateProjectDialog } from "@/features/projects/components/create-project-dialog";
import { DeleteProjectDialog } from "@/features/projects/components/delete-project-dialog";
import { RenameProjectDialog } from "@/features/projects/components/rename-project-dialog";
import {
  PROJECT_COLOR_VARS,
  PROJECT_ICON_COMPONENTS,
} from "@/features/projects/project-icons";
import type { ProjectSummary } from "@/features/projects/schemas";
import {
  PixelCog as Cog,
  PixelDotsHorizontalRounded as Dots,
  PixelEdit as Edit,
  PixelHome as Home,
  PixelLightBulb as LightBulb,
  PixelPaintBrush as PaintBrush,
  PixelPlus as Plus,
  PixelStar as Star,
  PixelTrash as Trash,
} from "@/ui/pixel-icons";

export type OrionSidebarRoom = { id: string; projectId: string };

// The Orion frame: logo, one personal group (Overview · Inspiration · Taste),
// New project, and a flat list of projects -- nothing nested under them.
// What's inside a project only appears once you're in it (its chat tabs).
export function OrionSidebar({
  workspaceId,
  projects,
  rooms,
  hasTasteUpdates = false,
}: {
  workspaceId: string;
  projects: ProjectSummary[];
  rooms: OrionSidebarRoom[];
  hasTasteUpdates?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { byProject } = useWorkspaceActivity();
  const collapseHandle = useRef<SideNavImperativeCollapseHandle>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ProjectSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const homePath = `/${workspaceId}`;
  const inspirationPath = `/${workspaceId}/inspiration`;
  const isInspirationArea = pathname.startsWith(inspirationPath);
  const isTaste = isInspirationArea && searchParams.get("tab") === "taste";
  const currentRoomId = pathname.match(/\/rooms\/([^/]+)/)?.[1] ?? null;
  const currentProjectId =
    pathname.match(/\/projects\/([^/]+)/)?.[1] ??
    rooms.find((room) => room.id === currentRoomId)?.projectId ??
    null;
  const chatCount = (projectId: string) =>
    rooms.filter((room) => room.projectId === projectId).length;

  // Apple HIG (Sidebars): people hide and show the sidebar with the
  // shortcut they know from macOS apps, Control-Command-S.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey && event.metaKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        collapseHandle.current?.getCollapseState()?.toggle();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <SideNav
        data-testid="orion-sidebar"
        handleRef={collapseHandle}
        collapsible={{ hasButton: false }}
        resizable={{
          defaultWidth: 248,
          minWidth: 208,
          maxWidth: 320,
          autoSaveId: "orion-sidebar-width",
        }}
        header={
          <SideNavHeading
            heading="Orion"
            headingHref={homePath}
            icon={
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src="/orion-o.svg"
                alt=""
                aria-hidden="true"
                style={{ blockSize: "var(--spacing-5)", inlineSize: "auto" }}
              />
            }
            headerEndContent={
              <SideNavCollapseButton handleRef={collapseHandle} />
            }
          />
        }
        footer={
          <SideNavSection title="App" isHeaderHidden>
            <SideNavItem
              label="Design system"
              icon={PaintBrush}
              href={`/${workspaceId}/design-system`}
              isSelected={pathname.startsWith(`/${workspaceId}/design-system`)}
            />
            <SideNavItem
              label="Settings"
              icon={Cog}
              href={`/${workspaceId}/settings/members`}
              isSelected={pathname.startsWith(`/${workspaceId}/settings`)}
            />
          </SideNavSection>
        }
      >
        <SideNavSection title="You" isHeaderHidden>
          <SideNavItem
            label="Overview"
            icon={Home}
            selectedIcon={Home}
            href={homePath}
            isSelected={pathname === homePath}
          />
          <SideNavItem
            label="Inspiration"
            icon={LightBulb}
            selectedIcon={LightBulb}
            href={inspirationPath}
            isSelected={isInspirationArea && !isTaste}
          />
          {/* The accessible name carries the signal; the dot is decorative so
              it isn't announced twice. */}
          <SideNavItem
            label={hasTasteUpdates ? "Taste, suggestions waiting" : "Taste"}
            icon={Star}
            selectedIcon={Star}
            href={`${inspirationPath}?tab=taste`}
            isSelected={isTaste}
            endContent={
              hasTasteUpdates ? (
                <StatusDot
                  variant="accent"
                  label="Taste suggestions waiting"
                  aria-hidden="true"
                  data-testid="taste-attention"
                />
              ) : undefined
            }
          />
        </SideNavSection>

        <SideNavSection title="Create" isHeaderHidden>
          <SideNavItem
            label="New project"
            icon={Plus}
            onClick={() => setIsCreateOpen(true)}
          />
        </SideNavSection>

        <SideNavSection title="Projects">
          {projects.map((project) => {
            const Glyph = PROJECT_ICON_COMPONENTS[project.icon];
            const activity = byProject.get(project.id);
            return (
              <SideNavItem
                key={project.id}
                label={project.name}
                href={`/${workspaceId}/projects/${project.id}`}
                isSelected={project.id === currentProjectId}
                icon={() => (
                  <ProjectStatusMark
                    name={project.name}
                    color={PROJECT_COLOR_VARS[project.color]}
                    state={activity?.state ?? "idle"}
                    room={activity?.room ?? null}
                    hop
                    fallback={
                      <Glyph
                        pack="filled"
                        size="xs"
                        fill={PROJECT_COLOR_VARS[project.color]}
                        aria-hidden="true"
                      />
                    }
                  />
                )}
                endContent={
                  <DropdownMenu
                    button={{
                      label: `${project.name} options`,
                      tooltip: `${project.name} options`,
                      icon: <Icon icon={Dots} size="sm" />,
                      isIconOnly: true,
                      variant: "ghost",
                      size: "sm",
                    }}
                    hasChevron={false}
                    items={[
                      {
                        label: "Rename",
                        icon: Edit,
                        onClick: () => setRenameTarget(project),
                      },
                      {
                        label: "Delete",
                        icon: Trash,
                        onClick: () => setDeleteTarget(project),
                      },
                    ]}
                    isMenuOpen={openMenuId === project.id}
                    onOpenChange={(isOpen) =>
                      setOpenMenuId(isOpen ? project.id : null)
                    }
                  />
                }
              />
            );
          })}
        </SideNavSection>
      </SideNav>

      <CreateProjectDialog
        workspaceId={workspaceId}
        isOpen={isCreateOpen}
        onOpenChange={setIsCreateOpen}
      />
      {renameTarget ? (
        <RenameProjectDialog
          workspaceId={workspaceId}
          project={renameTarget}
          isOpen
          onOpenChange={(isOpen) => {
            if (!isOpen) setRenameTarget(null);
          }}
        />
      ) : null}
      {deleteTarget ? (
        <DeleteProjectDialog
          workspaceId={workspaceId}
          project={deleteTarget}
          chatCount={chatCount(deleteTarget.id)}
          isOpen
          onOpenChange={(isOpen) => {
            if (!isOpen) setDeleteTarget(null);
          }}
        />
      ) : null}
    </>
  );
}
