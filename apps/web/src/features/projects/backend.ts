import "server-only";

import { isWorkspaceFakeEnabled } from "@/features/workspaces/e2e-gate";
import type {
  CreateProjectInput,
  ProjectReference,
  ProjectSummary,
  RenameProjectInput,
} from "./schemas";

export type ProjectBackend = {
  listWorkspaceProjects(workspaceId: string): Promise<ProjectSummary[]>;
  createProject(input: CreateProjectInput): Promise<ProjectSummary>;
  renameProject(input: RenameProjectInput): Promise<ProjectSummary>;
  deleteProject(input: ProjectReference): Promise<void>;
};

export async function getProjectBackend(): Promise<ProjectBackend> {
  if (isWorkspaceFakeEnabled()) {
    const { createFakeProjectBackend } = await import("./fake-backend");
    return createFakeProjectBackend();
  }
  const { createSupabaseProjectBackend } = await import(
    "./supabase-backend"
  );
  return createSupabaseProjectBackend();
}
