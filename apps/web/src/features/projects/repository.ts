import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ProjectReference,
  ProjectSummary,
  RenameProjectInput,
} from "./schemas";

type ProjectRow = {
  id: string;
  workspace_id: string;
  name: string;
  created_by: string;
};

type ProjectWriteInput = {
  workspaceId: string;
  name: string;
  createdBy: string;
};

const PROJECT_COLUMNS = "id,workspace_id,name,created_by";
const PROJECT_NOT_EMPTY_MESSAGE =
  "Move or delete this project's rooms before deleting the project.";

export class ProjectNotEmptyError extends Error {
  constructor() {
    super(PROJECT_NOT_EMPTY_MESSAGE);
    this.name = "ProjectNotEmptyError";
  }
}

function mapProject(row: ProjectRow): ProjectSummary {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    createdBy: row.created_by,
  };
}

export function createProjectRepository(supabase: SupabaseClient) {
  return {
    async listWorkspaceProjects(
      workspaceId: string,
    ): Promise<ProjectSummary[]> {
      const result = await supabase
        .from("projects")
        .select(PROJECT_COLUMNS)
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true });
      if (result.error) {
        throw new Error("We could not load projects.");
      }
      return ((result.data ?? []) as ProjectRow[]).map(mapProject);
    },

    async createProject(input: ProjectWriteInput): Promise<ProjectSummary> {
      const result = await supabase
        .from("projects")
        .insert({
          workspace_id: input.workspaceId,
          name: input.name,
          created_by: input.createdBy,
        })
        .select(PROJECT_COLUMNS)
        .single();
      if (result.error || !result.data) {
        throw new Error("We could not create the project.");
      }
      return mapProject(result.data as ProjectRow);
    },

    async renameProject(input: RenameProjectInput): Promise<ProjectSummary> {
      const result = await supabase
        .from("projects")
        .update({ name: input.name })
        .eq("id", input.projectId)
        .eq("workspace_id", input.workspaceId)
        .select(PROJECT_COLUMNS)
        .single();
      if (result.error || !result.data) {
        throw new Error("We could not rename the project.");
      }
      return mapProject(result.data as ProjectRow);
    },

    async deleteProject(input: ProjectReference): Promise<void> {
      const result = await supabase
        .from("projects")
        .delete()
        .eq("id", input.projectId)
        .eq("workspace_id", input.workspaceId)
        .select("id")
        .single();
      if (result.error?.code === "23503") {
        throw new ProjectNotEmptyError();
      }
      if (result.error || !result.data) {
        throw new Error("We could not delete the project.");
      }
    },
  };
}
