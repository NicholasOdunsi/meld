"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import { describeHatLabel } from "@/features/activity/describe";
import { useWorkspaceActivity } from "@/features/activity/workspace-activity-provider";
import {
  createProject,
  createProjectTab,
  deleteProjectAndChats,
  renameProject,
} from "@/features/projects/actions";
import {
  PROJECT_COLOR_OPTIONS,
  PROJECT_ICON_OPTIONS,
  type ProjectColor,
  type ProjectIcon,
} from "@/features/projects/schemas";
import {
  postToNative,
  registerFrameHandlers,
  type FrameResult,
  type FrameSnapshot,
} from "./bridge";

const FAILED: FrameResult = {
  status: "error",
  message: "Orion couldn't do that right now. Try again.",
};

function asColor(value: string | undefined): ProjectColor | undefined {
  return PROJECT_COLOR_OPTIONS.find((option) => option === value);
}

function asIcon(value: string | undefined): ProjectIcon | undefined {
  return PROJECT_ICON_OPTIONS.find((option) => option === value);
}

// Only paths inside this site; never a full URL or protocol-relative "//".
function isSitePath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//");
}

/**
 * Invisible. Inside the Orion Mac app (1.1+) the sidebar and project tabs are
 * native SwiftUI. This feeds them the data they draw and carries out what
 * they ask for (open a page, new project, new tab, rename, delete).
 */
export function NativeFrameBridge({
  workspaceId,
  projects,
  tabs,
  hasTasteUpdates,
}: Omit<FrameSnapshot, "path" | "activity">) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const path = search ? `${pathname}?${search}` : pathname;
  const { byRoom, byProject } = useWorkspaceActivity();
  const activity = useMemo(
    () => ({
      projects: projects.flatMap((project) => {
        const entry = byProject.get(project.id);
        return entry && entry.state !== "idle"
          ? [
              {
                id: project.id,
                state: entry.state,
                label: describeHatLabel(project.name, entry.room, entry.state),
              },
            ]
          : [];
      }),
      tabs: tabs.flatMap((tab) => {
        const room = byRoom.get(tab.id);
        return room && room.state !== "idle"
          ? [
              {
                id: tab.id,
                state: room.state,
                label: describeHatLabel(tab.name, room, room.state),
              },
            ]
          : [];
      }),
    }),
    [projects, tabs, byProject, byRoom],
  );
  const snapshot = useMemo<FrameSnapshot>(
    () => ({ workspaceId, path, projects, tabs, hasTasteUpdates, activity }),
    [workspaceId, path, projects, tabs, hasTasteUpdates, activity],
  );

  useEffect(() => {
    postToNative({ v: 1, type: "frame", ...snapshot });
  }, [snapshot]);

  useEffect(() => {
    async function run(
      action: () => Promise<FrameResult>,
    ): Promise<FrameResult> {
      try {
        const result = await action();
        router.refresh();
        return result;
      } catch {
        return FAILED;
      }
    }

    return registerFrameHandlers({
      navigate: (target) => {
        if (!isSitePath(target)) return FAILED;
        router.push(target);
        return { status: "ok", path: target };
      },
      createProject: (input) =>
        run(async () => {
          const result = await createProject({
            workspaceId,
            name: input.name,
            color: asColor(input.color),
            icon: asIcon(input.icon),
          });
          return result.status === "ok"
            ? {
                status: "ok",
                path: `/${workspaceId}/projects/${result.project.id}`,
              }
            : result;
        }),
      createTab: (projectId) =>
        run(async () => {
          const result = await createProjectTab({ workspaceId, projectId });
          return result.status === "ok"
            ? { status: "ok", path: `/${workspaceId}/rooms/${result.roomId}` }
            : result;
        }),
      renameProject: (projectId, name) =>
        run(async () => {
          const result = await renameProject({ workspaceId, projectId, name });
          return result.status === "ok" ? { status: "ok" } : result;
        }),
      deleteProject: (projectId) =>
        run(async () => {
          const result = await deleteProjectAndChats({
            workspaceId,
            projectId,
          });
          return result.status === "deleted"
            ? { status: "ok", path: `/${workspaceId}` }
            : { status: "error", message: result.message };
        }),
    });
  }, [router, workspaceId]);

  return null;
}
