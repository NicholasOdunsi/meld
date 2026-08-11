"use client";

import {
  Collapsible,
  CollapsibleGroup,
} from "@astryxdesign/core/Collapsible";
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
import { DotsHorizontalRounded } from "@boxicons/react/DotsHorizontalRounded";
import { Edit } from "@boxicons/react/Edit";
import { LightBulb } from "@boxicons/react/LightBulb";
import { Plus } from "@boxicons/react/Plus";
import { Trash } from "@boxicons/react/Trash";
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
import type { ProjectSummary } from "@/features/projects/schemas";
import { CreateProjectDialog } from "./create-project-dialog";
import { DeleteProjectDialog } from "./delete-project-dialog";
import { RenameProjectDialog } from "./rename-project-dialog";

export type ProjectNavigationRoom = {
  id: string;
  projectId: string;
  name: string;
  ownerId: string;
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
  if (
    input.routeProjectId &&
    input.projectIds.includes(input.routeProjectId)
  ) {
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
  const getServerSnapshot = useCallback(() => null, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
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
  const storedProjectId = useStoredProjectId(workspaceId);
  const routeSelectionKey = `${pathname}:${routeProjectId ?? ""}`;
  const [routeSelection, setRouteSelection] = useState(
    routeSelectionKey,
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  if (routeSelection !== routeSelectionKey) {
    setRouteSelection(routeSelectionKey);
    setSelectedProjectId(null);
  }
  const openProjectId =
    selectedProjectId && projectIds.includes(selectedProjectId)
      ? selectedProjectId
      : resolveOpenProjectId({
          routeProjectId,
          storedProjectId,
          projectIds,
        });
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [createRoomProjectId, setCreateRoomProjectId] = useState<
    string | null
  >(null);
  const [renameTarget, setRenameTarget] = useState<ProjectSummary | null>(
    null,
  );
  const [deleteProjectTarget, setDeleteProjectTarget] =
    useState<ProjectSummary | null>(null);
  const [deleteRoomTarget, setDeleteRoomTarget] =
    useState<ProjectNavigationRoom | null>(null);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [openMenuRoomId, setOpenMenuRoomId] = useState<string | null>(null);

  useEffect(() => {
    if (openProjectId) {
      window.localStorage.setItem(
        projectStorageKey(workspaceId),
        openProjectId,
      );
    } else {
      window.localStorage.removeItem(projectStorageKey(workspaceId));
    }
  }, [openProjectId, workspaceId]);

  function handleOpenProjectChange(value: string | string[]) {
    const nextProjectId = typeof value === "string" ? value : value[0];
    if (nextProjectId && projectIds.includes(nextProjectId)) {
      setSelectedProjectId(nextProjectId);
    }
  }

  return (
    <VStack
      gap={2}
      width="100%"
      data-testid="project-room-navigation"
    >
      <HStack
        gap={2}
        vAlign="center"
        width="100%"
        style={{
          paddingInlineEnd: "var(--spacing-2)",
          paddingInlineStart: "var(--spacing-3)",
        }}
      >
        <StackItem size="fill">
          <Text type="label">Projects</Text>
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

      <CollapsibleGroup
        type="single"
        value={openProjectId ?? ""}
        onChange={handleOpenProjectChange}
      >
        <VStack gap={1} width="100%">
          {projects.map((project) => {
            const projectRooms = rooms.filter(
              (room) => room.projectId === project.id,
            );
            return (
              <VStack
                key={project.id}
                width="100%"
                data-testid={`project-${project.id}`}
              >
                <Collapsible trigger={project.name} value={project.id}>
                  <VStack
                    gap={1}
                    paddingBlock={1}
                    width="100%"
                    style={{ paddingInlineStart: "var(--spacing-4)" }}
                  >
                    <HStack
                      gap={1}
                      hAlign="end"
                      vAlign="center"
                      width="100%"
                      style={{ paddingInlineEnd: "var(--spacing-2)" }}
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
                        <>
                          <IconButton
                            label={`Rename ${project.name}`}
                            tooltip={`Rename ${project.name}`}
                            icon={<Icon icon={Edit} size="xsm" />}
                            variant="ghost"
                            size="sm"
                            onClick={() => setRenameTarget(project)}
                          />
                          <IconButton
                            label={`Delete ${project.name}`}
                            tooltip={`Delete ${project.name}`}
                            icon={<Icon icon={Trash} size="xsm" />}
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteProjectTarget(project)}
                          />
                        </>
                      ) : null}
                    </HStack>
                    <Theme theme={projectRoomNavigationTheme}>
                      <VStack gap={1} width="100%">
                        {projectRooms.map((room) => {
                          const roomPath = `/${workspaceId}/rooms/${room.id}`;
                          const isSelected = pathname === roomPath;
                          const isActive =
                            activeRoomId === room.id ||
                            openMenuRoomId === room.id;
                          const menuItems: DropdownMenuOption[] = [];
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
                                  <Icon
                                    icon={LightBulb}
                                    size="sm"
                                    color={
                                      isSelected ? "primary" : "secondary"
                                    }
                                    data-testid="room-icon"
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
                </Collapsible>
              </VStack>
            );
          })}
        </VStack>
      </CollapsibleGroup>

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
    </VStack>
  );
}
