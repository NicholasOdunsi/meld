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

export async function deleteProject(input: ProjectReference) {
  const parsed = ProjectReferenceSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("We could not delete the project.");
  }
  try {
    await (await getProjectBackend()).deleteProject(parsed.data);
    revalidatePath(`/${parsed.data.workspaceId}`, "layout");
  } catch (error) {
    if (error instanceof ProjectNotEmptyError) {
      throw error;
    }
    throw new Error("We could not delete the project.");
  }
}
