"use server";

import { revalidatePath } from "next/cache";
import { getProjectBackend } from "./backend";
import { ProjectNotEmptyError } from "./repository";
import {
  CreateProjectInputSchema,
  ProjectReferenceSchema,
  RenameProjectInputSchema,
  WorkspaceProjectReferenceSchema,
  type CreateProjectInput,
  type ProjectReference,
  type ProjectSummary,
  type RenameProjectInput,
} from "./schemas";

// Next redacts the message of an error thrown out of a Server Action in a
// production build, so `throw new Error("We could not create the project.")`
// reaches the dialog as Next's generic placeholder and the copy is dead where
// it matters. A returned discriminated result crosses the boundary as data --
// the convention `deleteProject` below and `createRoomFromForm` already use.
export type ProjectMutationResult =
  | { status: "ok"; project: ProjectSummary }
  | { status: "error"; message: string };

const CREATE_PROJECT_ERROR = "We could not create the project.";
const RENAME_PROJECT_ERROR = "We could not rename the project.";

export type DeleteProjectResult =
  | { status: "deleted" }
  | {
      status: "blocked";
      reason: "project_not_empty";
      message: string;
    }
  | { status: "error"; message: string };

export async function listWorkspaceProjects(workspaceId: string) {
  const parsed = WorkspaceProjectReferenceSchema.shape.workspaceId.safeParse(
    workspaceId,
  );
  if (!parsed.success) {
    throw new Error("We could not load projects.");
  }
  try {
    return await (await getProjectBackend()).listWorkspaceProjects(
      parsed.data,
    );
  } catch {
    throw new Error("We could not load projects.");
  }
}

export async function createProject(
  input: CreateProjectInput,
): Promise<ProjectMutationResult> {
  const parsed = CreateProjectInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: CREATE_PROJECT_ERROR };
  }
  try {
    const project = await (await getProjectBackend()).createProject(
      parsed.data,
    );
    revalidatePath(`/${parsed.data.workspaceId}`, "layout");
    return { status: "ok", project };
  } catch {
    return { status: "error", message: CREATE_PROJECT_ERROR };
  }
}

export async function renameProject(
  input: RenameProjectInput,
): Promise<ProjectMutationResult> {
  const parsed = RenameProjectInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: RENAME_PROJECT_ERROR };
  }
  try {
    const project = await (await getProjectBackend()).renameProject(
      parsed.data,
    );
    revalidatePath(`/${parsed.data.workspaceId}`, "layout");
    return { status: "ok", project };
  } catch {
    return { status: "error", message: RENAME_PROJECT_ERROR };
  }
}

export async function deleteProject(
  input: ProjectReference,
): Promise<DeleteProjectResult> {
  const parsed = ProjectReferenceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "error",
      message: "We could not delete the project.",
    };
  }
  try {
    await (await getProjectBackend()).deleteProject(parsed.data);
    revalidatePath(`/${parsed.data.workspaceId}`, "layout");
    return { status: "deleted" };
  } catch (error) {
    if (error instanceof ProjectNotEmptyError) {
      return {
        status: "blocked",
        reason: "project_not_empty",
        message: error.message,
      };
    }
    return {
      status: "error",
      message: "We could not delete the project.",
    };
  }
}
