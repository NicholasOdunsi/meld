"use client";

import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import type { DropdownMenuOption } from "@astryxdesign/core/DropdownMenu";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { SideNavItem } from "@astryxdesign/core/SideNav";
import { StackItem } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Theme, defineTheme } from "@astryxdesign/core/theme";
import { VStack } from "@astryxdesign/core/VStack";
import { usePathname } from "next/navigation";
import type { CSSProperties } from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { DeleteRoomDialog } from "@/features/rooms/components/delete-room-dialog";
import { CreateRoomDialog } from "@/features/rooms/components/create-room-dialog";
import {
  PROJECT_COLOR_VARS,
  PROJECT_ICON_COMPONENTS,
} from "@/features/projects/project-icons";
import type { ProjectSummary } from "@/features/projects/schemas";
import type { RoomStage } from "@meld/contracts";
import { getRoomStagePresentation } from "@/features/rooms/stage";
import {
  PixelChevronDown as ChevronDown,
  PixelChevronRight as ChevronRight,
  PixelDotsHorizontalRounded as DotsHorizontalRounded,
  PixelEdit as Edit,
  PixelMove as Move,
  PixelPlus as Plus,
  PixelTrash as Trash,
} from "@/ui/pixel-icons";
import { CreateProjectDialog } from "./create-project-dialog";
import { DeleteProjectDialog } from "./delete-project-dialog";
import { RenameProjectDialog } from "./rename-project-dialog";
import { MoveRoomDialog } from "./move-room-dialog";

export type ProjectNavigationRoom = {
  id: string;
  projectId: string;
  name: string;
  ownerId: string;
  stage: RoomStage;
  updatedAt: string;
};

const projectRoomNavigationTheme = defineTheme({
  name: "meld-project-room-navigation",
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

export function projectStorageKey(workspaceId: string) {
  return `meld:workspace:${workspaceId}:open-project`;
}

export function resolveOpenProjectId(input: {
  routeProjectId: string | null;
  storedProjectId: string | null;
  projectIds: string[];
}) {
  if (input.routeProjectId && input.projectIds.includes(input.routeProjectId)) {
    return input.routeProjectId;
  }
  if (
    input.storedProjectId &&
    input.projectIds.includes(input.storedProjectId)
  ) {
    return input.storedProjectId;
  }
  return input.projectIds[0] ?? null;
}

// Neither the server render nor the hydration render that has to match it can
// read localStorage, and `useSyncExternalStore` re-renders with the real value
// only once hydration is done. Those two renders therefore need a value that
// says "not read yet", distinct from the "nothing stored" that null means:
// otherwise the effect that persists the open Project writes the first-Project
// fallback over the remembered choice before it has ever been read.
const STORED_PROJECT_UNREAD = Symbol("stored-project-unread");

// Sentinel for `selectedProjectId`: distinguishes "the reader explicitly
// collapsed the open Project" from `null`'s "no explicit choice made yet,
// fall back to route/stored/first". A plain string (not a Symbol, unlike
// STORED_PROJECT_UNREAD above) because it has to fit the same `string | null`
// state the state setter already carries -- an empty string never collides
// with a real Project id.
const MANUALLY_CLOSED = "";

function useStoredProjectId(workspaceId: string) {
  const key = projectStorageKey(workspaceId);
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      function handleStorage(event: StorageEvent) {
        if (event.key === key) onStoreChange();
      }
      window.addEventListener("storage", handleStorage);
      return () => window.removeEventListener("storage", handleStorage);
    },
    [key],
  );
  const getSnapshot = useCallback(
    () => window.localStorage.getItem(key),
    [key],
  );
  const getServerSnapshot = useCallback(() => STORED_PROJECT_UNREAD, []);

  return useSyncExternalStore<string | null | typeof STORED_PROJECT_UNREAD>(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
}

export function ProjectRoomNavigation({
  workspaceId,
  projects,
  rooms,
  currentUserId,
  isWorkspaceAdmin,
}: {
  workspaceId: string;
  projects: ProjectSummary[];
  rooms: ProjectNavigationRoom[];
  currentUserId: string;
  isWorkspaceAdmin: boolean;
}) {
  const pathname = usePathname();
  const projectIds = useMemo(
    () => projects.map((project) => project.id),
    [projects],
  );
  const routeRoom = rooms.find(
    (room) => pathname === `/${workspaceId}/rooms/${room.id}`,
  );
  const routeProjectId = routeRoom?.projectId ?? null;
  const storedProject = useStoredProjectId(workspaceId);
  const hasReadStoredProject = storedProject !== STORED_PROJECT_UNREAD;
  const storedProjectId = hasReadStoredProject ? storedProject : null;
  const routeSelectionKey = `${pathname}:${routeProjectId ?? ""}`;
  const [routeSelection, setRouteSelection] = useState(routeSelectionKey);
  // `selectedProjectId` has three meanings: null = no explicit choice yet
  // (fall back to route/stored/first), a project id = that project is open,
  // and "" (MANUALLY_CLOSED) = the reader explicitly collapsed the open
  // project and none should re-open until they pick one or navigate.
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  if (routeSelection !== routeSelectionKey) {
    setRouteSelection(routeSelectionKey);
    setSelectedProjectId(null);
  }
  const isManuallyClosed = selectedProjectId === MANUALLY_CLOSED;
  const openProjectId = isManuallyClosed
    ? null
    : selectedProjectId && projectIds.includes(selectedProjectId)
      ? selectedProjectId
      : resolveOpenProjectId({
          routeProjectId,
          storedProjectId,
          projectIds,
        });
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [createRoomProjectId, setCreateRoomProjectId] = useState<string | null>(
    null,
  );
  const [renameTarget, setRenameTarget] = useState<ProjectSummary | null>(null);
  const [deleteProjectTarget, setDeleteProjectTarget] =
    useState<ProjectSummary | null>(null);
  const [deleteRoomTarget, setDeleteRoomTarget] =
    useState<ProjectNavigationRoom | null>(null);
  const [moveRoomTarget, setMoveRoomTarget] =
    useState<ProjectNavigationRoom | null>(null);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [openMenuRoomId, setOpenMenuRoomId] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [openMenuProjectId, setOpenMenuProjectId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    // Until the stored Project has actually been read, whatever is open is a
    // fallback rather than a choice, and writing it would destroy the memory
    // this effect exists to keep. A manual collapse is session-only UI state,
    // not a choice about which Project to remember -- it must not evict the
    // stored preference a later visit would otherwise reopen.
    if (!hasReadStoredProject || isManuallyClosed) return;
    if (openProjectId) {
      window.localStorage.setItem(
        projectStorageKey(workspaceId),
        openProjectId,
      );
    } else {
      window.localStorage.removeItem(projectStorageKey(workspaceId));
    }
  }, [hasReadStoredProject, isManuallyClosed, openProjectId, workspaceId]);

  // Clicking the open Project's own trigger collapses it; clicking any other
  // Project opens it -- the single-open accordion the group below already
  // coordinates, now with a way back to "none open".
  function handleOpenProjectChange(nextProjectId: string) {
    if (!projectIds.includes(nextProjectId)) return;
    setSelectedProjectId(
      nextProjectId === openProjectId ? MANUALLY_CLOSED : nextProjectId,
    );
  }

  return (
    <VStack gap={2} width="100%" data-testid="project-room-navigation">
      <HStack gap={2} vAlign="center" width="100%">
        <StackItem size="fill">
          <Text type="label" color="secondary">
            Projects
          </Text>
        </StackItem>
        {isWorkspaceAdmin ? (
          <IconButton
            label="Create project"
            tooltip="Create project"
            icon={<Icon icon={Plus} size="xsm" />}
            variant="ghost"
            size="sm"
            onClick={() => setIsCreateProjectOpen(true)}
          />
        ) : null}
      </HStack>

      <VStack gap={2} width="100%">
        {projects.map((project) => {
          const projectRooms = rooms.filter(
            (room) => room.projectId === project.id,
          );
          const isProjectOpen = project.id === openProjectId;
          const isProjectActive =
            activeProjectId === project.id || openMenuProjectId === project.id;
          const projectContentId = `${project.id}-rooms`;
          // The chevron replaces the project's own icon only on hover, and
          // stays a neutral grey there regardless of what colour the icon
          // itself carries.
          const RowGlyph = isProjectActive
            ? isProjectOpen
              ? ChevronDown
              : ChevronRight
            : PROJECT_ICON_COMPONENTS[project.icon];
          return (
            <VStack
              key={project.id}
              width="100%"
              data-testid={`project-${project.id}`}
              style={{ position: "relative" }}
              onMouseEnter={() => setActiveProjectId(project.id)}
              onMouseLeave={() =>
                setActiveProjectId((current) =>
                  current === project.id ? null : current,
                )
              }
              onFocus={() => setActiveProjectId(project.id)}
              onBlur={(event) => {
                if (
                  !event.currentTarget.contains(
                    event.relatedTarget as Node | null,
                  )
                ) {
                  setActiveProjectId((current) =>
                    current === project.id ? null : current,
                  );
                }
              }}
            >
              {/* A plain button (not the Collapsible primitive) so this row
                  can match the Home/Search items above pixel-for-pixel and
                  swap its leading icon for a chevron on hover -- Collapsible's
                  own chevron comes from a global icon registry shared by every
                  instance in the app, so it can't be hidden or relocated per
                  usage. */}
              <button
                type="button"
                aria-expanded={isProjectOpen}
                aria-controls={projectContentId}
                onClick={() => handleOpenProjectChange(project.id)}
                style={
                  {
                    alignItems: "center",
                    backgroundColor: isProjectActive
                      ? "var(--color-overlay-hover)"
                      : "transparent",
                    borderRadius: "var(--radius-element)",
                    borderStyle: "none",
                    borderWidth: 0,
                    color: "inherit",
                    cursor: "pointer",
                    display: "flex",
                    fontFamily: "inherit",
                    gap: "var(--spacing-2)",
                    height: "var(--size-element-md)",
                    paddingInline: "var(--spacing-2)",
                    textAlign: "start",
                    width: "100%",
                  } as CSSProperties
                }
              >
                <RowGlyph
                  pack="filled"
                  size="xs"
                  fill={
                    isProjectActive
                      ? "var(--color-icon-secondary)"
                      : PROJECT_COLOR_VARS[project.color]
                  }
                  aria-hidden="true"
                />
                <Text type="label">{project.name}</Text>
              </button>
              {isProjectOpen ? (
                <VStack
                  id={projectContentId}
                  gap={1}
                  paddingBlock={1}
                  width="100%"
                  style={{ paddingInlineStart: "var(--spacing-4)" }}
                >
                  <Theme theme={projectRoomNavigationTheme}>
                    <VStack gap={1} width="100%">
                      {projectRooms.map((room) => {
                        const stagePresentation = getRoomStagePresentation(
                          room.stage,
                        );
                        const roomPath = `/${workspaceId}/rooms/${room.id}`;
                        const isSelected = pathname === roomPath;
                        const isActive =
                          activeRoomId === room.id ||
                          openMenuRoomId === room.id;
                        const menuItems: DropdownMenuOption[] = [];
                        if (
                          projects.length > 1 &&
                          (room.ownerId === currentUserId || isWorkspaceAdmin)
                        ) {
                          menuItems.push({
                            label: "Move room",
                            icon: Move,
                            onClick: () => setMoveRoomTarget(room),
                          });
                        }
                        if (room.ownerId === currentUserId) {
                          menuItems.push({
                            label: "Delete room",
                            icon: Trash,
                            onClick: () => setDeleteRoomTarget(room),
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
                                // No explicit `pack`: boxicons defaults to
                                // "basic" (line/outline), so this stays a
                                // line icon without fighting the DS Icon
                                // wrapper for a pack prop it doesn't expose.
                                <Icon
                                  icon={stagePresentation.icon}
                                  size="sm"
                                  color={isSelected ? "primary" : "secondary"}
                                  data-testid="room-icon"
                                  // `label`, not `aria-label`: Icon spreads
                                  // `aria-hidden="true"` unless `label` is
                                  // set, so an `aria-label` alone never
                                  // reaches the accessibility tree.
                                  label={stagePresentation.label}
                                />
                              }
                              href={roomPath}
                              isSelected={isSelected}
                              size="sm"
                            />
                            {menuItems.length > 0 ? (
                              <HStack
                                vAlign="center"
                                style={
                                  {
                                    insetBlock: 0,
                                    insetInlineEnd: "var(--spacing-1)",
                                    opacity: isActive ? 1 : 0,
                                    position: "absolute",
                                  } as CSSProperties
                                }
                              >
                                <DropdownMenu
                                  button={{
                                    label: `${room.name} options`,
                                    tooltip: `${room.name} options`,
                                    icon: (
                                      <Icon
                                        icon={DotsHorizontalRounded}
                                        size="sm"
                                      />
                                    ),
                                    isIconOnly: true,
                                    variant: "ghost",
                                    size: "sm",
                                  }}
                                  hasChevron={false}
                                  items={menuItems}
                                  isMenuOpen={openMenuRoomId === room.id}
                                  onOpenChange={(isMenuOpen) =>
                                    setOpenMenuRoomId(
                                      isMenuOpen ? room.id : null,
                                    )
                                  }
                                />
                              </HStack>
                            ) : null}
                          </VStack>
                        );
                      })}
                    </VStack>
                  </Theme>
                </VStack>
              ) : null}
              <HStack
                gap={1}
                vAlign="center"
                style={
                  {
                    insetBlockStart: 0,
                    insetInlineEnd: "var(--spacing-1)",
                    height: "var(--size-element-md)",
                    opacity: isProjectActive ? 1 : 0,
                    position: "absolute",
                  } as CSSProperties
                }
              >
                <IconButton
                  label={`Add room to ${project.name}`}
                  tooltip={`Add room to ${project.name}`}
                  icon={<Icon icon={Plus} size="xsm" />}
                  variant="ghost"
                  size="sm"
                  onClick={() => setCreateRoomProjectId(project.id)}
                />
                {isWorkspaceAdmin ? (
                  <DropdownMenu
                    button={{
                      label: `${project.name} options`,
                      tooltip: `${project.name} options`,
                      icon: <Icon icon={DotsHorizontalRounded} size="sm" />,
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
                        onClick: () => setDeleteProjectTarget(project),
                      },
                    ]}
                    isMenuOpen={openMenuProjectId === project.id}
                    onOpenChange={(isMenuOpen) =>
                      setOpenMenuProjectId(isMenuOpen ? project.id : null)
                    }
                  />
                ) : null}
              </HStack>
            </VStack>
          );
        })}
      </VStack>

      <CreateProjectDialog
        workspaceId={workspaceId}
        isOpen={isCreateProjectOpen}
        onOpenChange={setIsCreateProjectOpen}
      />
      {createRoomProjectId ? (
        <CreateRoomDialog
          workspaceId={workspaceId}
          projectId={createRoomProjectId}
          isOpen
          onOpenChange={(isOpen) => {
            if (!isOpen) setCreateRoomProjectId(null);
          }}
        />
      ) : null}
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
      {deleteProjectTarget ? (
        <DeleteProjectDialog
          workspaceId={workspaceId}
          project={deleteProjectTarget}
          isOpen
          onOpenChange={(isOpen) => {
            if (!isOpen) setDeleteProjectTarget(null);
          }}
        />
      ) : null}
      {deleteRoomTarget ? (
        <DeleteRoomDialog
          workspaceId={workspaceId}
          roomId={deleteRoomTarget.id}
          isOpen
          onOpenChange={(isOpen) => {
            if (!isOpen) setDeleteRoomTarget(null);
          }}
        />
      ) : null}
      {moveRoomTarget ? (
        <MoveRoomDialog
          workspaceId={workspaceId}
          room={moveRoomTarget}
          projects={projects}
          isOpen
          onMoved={setSelectedProjectId}
          onOpenChange={(isOpen) => {
            if (!isOpen) setMoveRoomTarget(null);
          }}
        />
      ) : null}
    </VStack>
  );
}
