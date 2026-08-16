import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ProjectBackend } from "./backend";
import { createProjectRepository } from "./repository";

export async function createSupabaseProjectBackend(): Promise<ProjectBackend> {
  const supabase = await createClient(new Headers());
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error("Authentication required");
  }
  const repository = createProjectRepository(supabase);
  return {
    listWorkspaceProjects(workspaceId) {
      return repository.listWorkspaceProjects(workspaceId);
    },
    createProject(input) {
      return repository.createProject({
        ...input,
        createdBy: user.id,
      });
    },
    renameProject(input) {
      return repository.renameProject(input);
    },
    deleteProject(input) {
      return repository.deleteProject(input);
    },
  };
}
