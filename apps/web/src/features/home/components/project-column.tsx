"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { MeldProjectTile } from "@/ui/meld/project-tile";
import {
  MeldPeekCard,
  type MeldPeekShape,
  type MeldTileColor,
} from "@/ui/meld/peek-card";
import { MeldStack } from "@/ui/meld/stack";
import { MeldColumnHeading } from "@/ui/meld/column-heading";
import { MeldButton } from "@/ui/meld/button";
import { CreateProjectDialog } from "@/features/projects/components/create-project-dialog";
import { CreateRoomDialog } from "@/features/rooms/components/create-room-dialog";
import { formatRelativeTime } from "../relative-time";
import { DeckShortcuts } from "./deck-shortcuts";

export type DeckProject = {
  id: string;
  name: string;
  color: MeldTileColor;
  roomCount: number;
  /**
   * Where the tile goes. There is no project page yet, so a tile opens the
   * project's most recently active room. `null` when the project has no rooms,
   * in which case the tile is not a link at all. Swap this for the project
   * route the day one exists -- it is the only line that needs to change.
   */
  latestRoomId: string | null;
  /**
   * ISO timestamp of the most recent activity in the project. `null` when the
   * project has no rooms: there is nothing to age from, and a tile reading
   * "0 rooms · now" would claim activity that never happened.
   */
  updatedAt: string | null;
  isLive: boolean;
  unreadCount: number;
  peekShape: MeldPeekShape;
};

export type ProjectColumnProps = {
  workspaceId: string;
  projects: DeckProject[];
  printedOn: Date;
};

export function ProjectColumn({
  workspaceId,
  projects,
  printedOn,
}: ProjectColumnProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  // A single dialog instance shared by every project's "+ room" control,
  // rather than one dialog per tile. `null` means closed; a project id means
  // open for that project.
  const [openRoomProjectId, setOpenRoomProjectId] = useState<string | null>(
    null,
  );

  return (
    <MeldStack gap={4}>
      <MeldColumnHeading label="PROJECTS" count={projects.length} />
      {projects.map((project) => {
        const tile = (
          <MeldProjectTile
            name={project.name}
            color={project.color}
            roomCount={project.roomCount}
            updatedLabel={
              project.updatedAt === null
                ? null
                : formatRelativeTime(project.updatedAt, printedOn)
            }
            isLive={project.isLive}
            unreadCount={project.unreadCount}
            peek={
              <MeldPeekCard shape={project.peekShape} color={project.color} />
            }
          />
        );

        // The "+ room" control is a sibling of the link, never a child of
        // it -- a button nested inside an anchor is invalid HTML and would
        // also navigate on click. This holds for both branches, including
        // the room-less one: that tile is currently a dead end, so it needs
        // the control most of all.
        return (
          <Fragment key={project.id}>
            {project.latestRoomId ? (
              <Link href={`/${workspaceId}/rooms/${project.latestRoomId}`}>
                {tile}
              </Link>
            ) : (
              tile
            )}
            <MeldButton
              label="+ room"
              variant="ghost"
              onClick={() => setOpenRoomProjectId(project.id)}
            />
          </Fragment>
        );
      })}
      <MeldButton
        label="+ new project"
        variant="ghost"
        onClick={() => setIsCreateOpen(true)}
      />
      <CreateProjectDialog
        workspaceId={workspaceId}
        isOpen={isCreateOpen}
        onOpenChange={setIsCreateOpen}
      />
      <CreateRoomDialog
        workspaceId={workspaceId}
        projectId={openRoomProjectId ?? ""}
        isOpen={openRoomProjectId !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setOpenRoomProjectId(null);
          }
        }}
      />
      <DeckShortcuts onNewProject={() => setIsCreateOpen(true)} />
    </MeldStack>
  );
}
