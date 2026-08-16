import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_PROJECT_COLOR,
  DEFAULT_PROJECT_ICON,
  PROJECT_COLOR_OPTIONS,
  PROJECT_ICON_OPTIONS,
  type ProjectColor,
  type ProjectIcon,
  type ProjectReference,
  type ProjectSummary,
  type RenameProjectInput,
} from "./schemas";

type ProjectRow = {
  id: string;
  workspace_id: string;
  name: string;
  created_by: string;
  icon: string;
  color: string;
};

type ProjectWriteInput = {
  workspaceId: string;
  name: string;
  createdBy: string;
  icon?: ProjectIcon;
  color?: ProjectColor;
};

const PROJECT_COLUMNS = "id,workspace_id,name,created_by,icon,color";
const PROJECT_NOT_EMPTY_MESSAGE =
  "Move or delete this project's rooms before deleting the project.";

export class ProjectNotEmptyError extends Error {
  constructor() {
    super(PROJECT_NOT_EMPTY_MESSAGE);
    this.name = "ProjectNotEmptyError";
  }
}

// The database's check constraints are the real guard; these casts only
// cover the read path if a value is ever added to a constraint before the
// app's curated set (or removed from it after rows already used it).
function toProjectIcon(value: string): ProjectIcon {
  return (PROJECT_ICON_OPTIONS as readonly string[]).includes(value)
    ? (value as ProjectIcon)
    : DEFAULT_PROJECT_ICON;
}

function toProjectColor(value: string): ProjectColor {
  return (PROJECT_COLOR_OPTIONS as readonly string[]).includes(value)
    ? (value as ProjectColor)
    : DEFAULT_PROJECT_COLOR;
}

function mapProject(row: ProjectRow): ProjectSummary {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    createdBy: row.created_by,
    icon: toProjectIcon(row.icon),
    color: toProjectColor(row.color),
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
          icon: input.icon ?? DEFAULT_PROJECT_ICON,
          color: input.color ?? DEFAULT_PROJECT_COLOR,
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
