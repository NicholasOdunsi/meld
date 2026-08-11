import "server-only";

import {
  fakeCreateProject,
  fakeDeleteProject,
  fakeRenameProject,
  listFakeWorkspaceProjects,
} from "@/features/workspaces/e2e-fake";
import type { ProjectBackend } from "./backend";
import { ProjectNotEmptyError } from "./repository";

export function createFakeProjectBackend(): ProjectBackend {
  return {
    listWorkspaceProjects(workspaceId) {
      return listFakeWorkspaceProjects(workspaceId);
    },
    createProject(input) {
      return fakeCreateProject(input);
    },
    renameProject(input) {
      return fakeRenameProject(input);
    },
    async deleteProject(input) {
      const { fakeProjectHasRooms } = await import(
        "@/features/rooms/e2e-fake"
      );
      if (fakeProjectHasRooms(input.projectId)) {
        throw new ProjectNotEmptyError();
      }
      await fakeDeleteProject(input);
    },
  };
}
