"use client";

import { Heading } from "@astryxdesign/core/Heading";
import { List, ListItem } from "@astryxdesign/core/List";
import { VStack } from "@astryxdesign/core/VStack";
import {
  PROJECT_COLOR_VARS,
  PROJECT_ICON_COMPONENTS,
} from "@/features/projects/project-icons";
import type { ProjectSummary } from "@/features/projects/schemas";
import { OrionHatMark } from "@/ui/orion-hat-mark";
import { describeHatLabel, describeProjectStatus } from "../describe";
import { useWorkspaceActivity } from "../workspace-activity-provider";

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
function formatRelative(iso: string) {
  const days = Math.round(
    (new Date(iso).getTime() - Date.now()) / 86_400_000,
  );
  if (days === 0) return "today";
  if (days > -7) return relative.format(days, "day");
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function AllProjectsList({
  workspaceId,
  projects,
  tabCounts,
}: {
  workspaceId: string;
  projects: ProjectSummary[];
  tabCounts: Record<string, number>;
}) {
  const { rooms, byProject } = useWorkspaceActivity();
  const lastActive = (projectId: string) =>
    rooms
      .filter((room) => room.projectId === projectId && room.lastActivityAt)
      .map((room) => room.lastActivityAt!)
      .sort()
      .at(-1) ?? null;

  return (
    <VStack gap={3}>
      <Heading level={2}>All projects</Heading>
      <List hasDividers>
        {projects.map((project) => {
          const activity = byProject.get(project.id) ?? {
            projectId: project.id,
            state: "idle" as const,
            room: null,
          };
          const Glyph = PROJECT_ICON_COMPONENTS[project.icon];
          const color = PROJECT_COLOR_VARS[project.color];
          const count = tabCounts[project.id] ?? 0;
          return (
            <ListItem
              key={project.id}
              label={project.name}
              description={`${count} ${count === 1 ? "tab" : "tabs"} · ${describeProjectStatus(activity, lastActive(project.id), formatRelative)}`}
              href={`/${workspaceId}/projects/${project.id}`}
              startContent={
                activity.state === "idle" ? (
                  <Glyph pack="filled" size="md" fill={color} aria-hidden="true" />
                ) : (
                  <OrionHatMark
                    state={activity.state}
                    color={color}
                    hop={false}
                    size="md"
                    label={describeHatLabel(
                      project.name,
                      activity.room,
                      activity.state,
                    )}
                  />
                )
              }
            />
          );
        })}
      </List>
    </VStack>
  );
}
