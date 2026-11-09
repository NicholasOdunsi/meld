"use server";

import { revalidatePath } from "next/cache";
import { getRoomBackend } from "@/features/rooms/backend";
import { getProjectBackend } from "./backend";
import { MAIN_TAB_NAME, nextTabName, orderProjectTabs } from "./project-tabs";
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

export type CreateProjectTabResult =
  | { status: "ok"; roomId: string }
  | { status: "error"; message: string };

const CREATE_TAB_ERROR = "We could not open a new tab.";

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
    // Every project opens straight into a chat. Best effort: if this fails the
    // project still exists, and opening it creates Main then (openProject).
    try {
      await (await getRoomBackend()).createRoom({
        workspaceId: project.workspaceId,
        projectId: project.id,
        name: MAIN_TAB_NAME,
      });
    } catch {
      // Swallowed on purpose -- see above.
    }
    revalidatePath(`/${parsed.data.workspaceId}`, "layout");
    return { status: "ok", project };
  } catch {
    return { status: "error", message: CREATE_PROJECT_ERROR };
  }
}

// The "+" on a project's tab strip: a new chat (room) named "New chat",
// "New chat 2", … with no dialog in between.
export async function createProjectTab(
  input: ProjectReference,
): Promise<CreateProjectTabResult> {
  const parsed = ProjectReferenceSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: CREATE_TAB_ERROR };
  }
  try {
    const backend = await getRoomBackend();
    const rooms = await backend.listRooms(parsed.data.workspaceId);
    const tabs = orderProjectTabs(rooms, parsed.data.projectId);
    const room = await backend.createRoom({
      workspaceId: parsed.data.workspaceId,
      projectId: parsed.data.projectId,
      name: nextTabName(tabs.map((tab) => tab.name)),
    });
    revalidatePath(`/${parsed.data.workspaceId}`, "layout");
    return { status: "ok", roomId: room.id };
  } catch {
    return { status: "error", message: CREATE_TAB_ERROR };
  }
}

// In the Orion frame a project is its chats, so deleting it deletes them too.
// Not atomic: if a room fails to delete, the rest stay and the project stays,
// and the person can simply try again.
export async function deleteProjectAndChats(
  input: ProjectReference,
): Promise<DeleteProjectResult> {
  const parsed = ProjectReferenceSchema.safeParse(input);
  const failure = {
    status: "error" as const,
    message: "We could not delete the project.",
  };
  if (!parsed.success) return failure;
  try {
    const roomBackend = await getRoomBackend();
    const rooms = await roomBackend.listRooms(parsed.data.workspaceId);
    for (const room of orderProjectTabs(rooms, parsed.data.projectId)) {
      await roomBackend.deleteRoom({
        workspaceId: parsed.data.workspaceId,
        roomId: room.id,
      });
    }
    await (await getProjectBackend()).deleteProject(parsed.data);
    revalidatePath(`/${parsed.data.workspaceId}`, "layout");
    return { status: "deleted" };
  } catch {
    revalidatePath(`/${parsed.data.workspaceId}`, "layout");
    return failure;
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
