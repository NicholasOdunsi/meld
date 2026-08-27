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
import { CreateProjectDialog } from "@/features/projects/components/create-project-dialog";
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
  return (
    <MeldStack gap={6}>
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

        return (
          <Fragment key={project.id}>
            {project.latestRoomId ? (
              <Link href={`/${workspaceId}/rooms/${project.latestRoomId}`}>
                {tile}
              </Link>
            ) : (
              tile
            )}
          </Fragment>
        );
      })}
      {/* No visible trigger: the "+ new project" button was removed with the
          rest of the chrome. The dialog stays mounted so ⌘N still opens it. */}
      <CreateProjectDialog
        workspaceId={workspaceId}
        isOpen={isCreateOpen}
        onOpenChange={setIsCreateOpen}
      />
      <DeckShortcuts onNewProject={() => setIsCreateOpen(true)} />
    </MeldStack>
  );
}
