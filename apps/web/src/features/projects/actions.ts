"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createProjectRepository } from "./repository";
import {
  CreateProjectInputSchema,
  ProjectReferenceSchema,
  RenameProjectInputSchema,
  WorkspaceProjectReferenceSchema,
  type CreateProjectInput,
  type ProjectReference,
  type RenameProjectInput,
} from "./schemas";

const PROJECT_NOT_EMPTY_MESSAGE =
  "Move or delete this project's rooms before deleting the project.";

async function getAuthenticatedProjectRepository() {
  const supabase = await createClient(new Headers());
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error("Authentication required");
  }
  return {
    repository: createProjectRepository(supabase),
    userId: user.id,
  };
}

export async function listWorkspaceProjects(workspaceId: string) {
  const parsed = WorkspaceProjectReferenceSchema.shape.workspaceId.parse(
    workspaceId,
  );
  const { repository } = await getAuthenticatedProjectRepository();
  try {
    return await repository.listWorkspaceProjects(parsed);
  } catch {
    throw new Error("We could not load projects.");
  }
}

export async function createProject(input: CreateProjectInput) {
  const parsed = CreateProjectInputSchema.parse(input);
  const { repository, userId } = await getAuthenticatedProjectRepository();
  try {
    const project = await repository.createProject({
      ...parsed,
      createdBy: userId,
    });
    revalidatePath(`/${parsed.workspaceId}`, "layout");
    return project;
  } catch {
    throw new Error("We could not create the project.");
  }
}

export async function renameProject(input: RenameProjectInput) {
  const parsed = RenameProjectInputSchema.parse(input);
  const { repository } = await getAuthenticatedProjectRepository();
  try {
    const project = await repository.renameProject(parsed);
    revalidatePath(`/${parsed.workspaceId}`, "layout");
    return project;
  } catch {
    throw new Error("We could not rename the project.");
  }
}

export async function deleteProject(input: ProjectReference) {
  const parsed = ProjectReferenceSchema.parse(input);
  const { repository } = await getAuthenticatedProjectRepository();
  try {
    await repository.deleteProject(parsed);
    revalidatePath(`/${parsed.workspaceId}`, "layout");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === PROJECT_NOT_EMPTY_MESSAGE
    ) {
      throw new Error(PROJECT_NOT_EMPTY_MESSAGE);
    }
    throw new Error("We could not delete the project.");
  }
}
