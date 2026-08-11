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
  type RenameProjectInput,
} from "./schemas";

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

export async function createProject(input: CreateProjectInput) {
  const parsed = CreateProjectInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("We could not create the project.");
  }
  try {
    const project = await (await getProjectBackend()).createProject(
      parsed.data,
    );
    revalidatePath(`/${parsed.data.workspaceId}`, "layout");
    return project;
  } catch {
    throw new Error("We could not create the project.");
  }
}

export async function renameProject(input: RenameProjectInput) {
  const parsed = RenameProjectInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("We could not rename the project.");
  }
  try {
    const project = await (await getProjectBackend()).renameProject(
      parsed.data,
    );
    revalidatePath(`/${parsed.data.workspaceId}`, "layout");
    return project;
  } catch {
    throw new Error("We could not rename the project.");
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
