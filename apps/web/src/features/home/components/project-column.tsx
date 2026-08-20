"use client";

import Link from "next/link";
import { useState } from "react";
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
import { formatRelativeTime } from "../relative-time";

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
  /** ISO timestamp of the most recent activity in the project. */
  updatedAt: string;
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

  return (
    <MeldStack gap={4}>
      <MeldColumnHeading label="PROJECTS" count={projects.length} />
      {projects.map((project) => {
        const tile = (
          <MeldProjectTile
            name={project.name}
            color={project.color}
            roomCount={project.roomCount}
            updatedLabel={formatRelativeTime(project.updatedAt, printedOn)}
            isLive={project.isLive}
            unreadCount={project.unreadCount}
            peek={
              <MeldPeekCard shape={project.peekShape} color={project.color} />
            }
          />
        );

        return project.latestRoomId ? (
          <Link
            key={project.id}
            href={`/${workspaceId}/rooms/${project.latestRoomId}`}
          >
            {tile}
          </Link>
        ) : (
          <MeldStack key={project.id}>{tile}</MeldStack>
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
    </MeldStack>
  );
}
