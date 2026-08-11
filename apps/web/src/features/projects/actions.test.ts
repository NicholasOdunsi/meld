import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  listWorkspaceProjects: vi.fn(),
  createProject: vi.fn(),
  renameProject: vi.fn(),
  deleteProject: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("./repository", () => ({
  createProjectRepository: () => ({
    listWorkspaceProjects: mocks.listWorkspaceProjects,
    createProject: mocks.createProject,
    renameProject: mocks.renameProject,
    deleteProject: mocks.deleteProject,
  }),
}));

import {
  createProject,
  deleteProject,
  listWorkspaceProjects,
  renameProject,
} from "./actions";

const WORKSPACE_ID = "30000000-0000-4000-8000-000000000003";
const PROJECT_ID = "70000000-0000-4000-8000-000000000007";
const OWNER_ID = "10000000-0000-4000-8000-000000000001";

describe("project actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: OWNER_ID } },
      error: null,
    });
    mocks.createClient.mockResolvedValue({
      auth: { getUser: mocks.getUser },
    });
  });

  it("lists projects through an authenticated client", async () => {
    mocks.listWorkspaceProjects.mockResolvedValue([]);

    await expect(listWorkspaceProjects(WORKSPACE_ID)).resolves.toEqual([]);

    expect(mocks.listWorkspaceProjects).toHaveBeenCalledWith(WORKSPACE_ID);
    expect(mocks.getUser).toHaveBeenCalledOnce();
  });

  it("trims names, assigns the current user, and revalidates after create", async () => {
    const project = {
      id: PROJECT_ID,
      workspaceId: WORKSPACE_ID,
      name: "Mobile onboarding",
      createdBy: OWNER_ID,
    };
    mocks.createProject.mockResolvedValue(project);

    await expect(
      createProject({
        workspaceId: WORKSPACE_ID,
        name: "  Mobile onboarding  ",
      }),
    ).resolves.toEqual(project);

    expect(mocks.createProject).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      name: "Mobile onboarding",
      createdBy: OWNER_ID,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/${WORKSPACE_ID}`,
      "layout",
    );
  });

  it("validates project identifiers and names before repository access", async () => {
    await expect(
      renameProject({
        workspaceId: "not-a-uuid",
        projectId: PROJECT_ID,
        name: "",
      }),
    ).rejects.toThrow();
    expect(mocks.renameProject).not.toHaveBeenCalled();
  });

  it("revalidates after rename and delete", async () => {
    mocks.renameProject.mockResolvedValue({ id: PROJECT_ID });
    mocks.deleteProject.mockResolvedValue(undefined);

    await renameProject({
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
      name: "Activation",
    });
    await deleteProject({ workspaceId: WORKSPACE_ID, projectId: PROJECT_ID });

    expect(mocks.revalidatePath).toHaveBeenCalledTimes(2);
    expect(mocks.revalidatePath).toHaveBeenNthCalledWith(
      1,
      `/${WORKSPACE_ID}`,
      "layout",
    );
    expect(mocks.revalidatePath).toHaveBeenNthCalledWith(
      2,
      `/${WORKSPACE_ID}`,
      "layout",
    );
  });

  it("preserves the stable non-empty Project restriction", async () => {
    mocks.deleteProject.mockRejectedValue(
      new Error(
        "Move or delete this project's rooms before deleting the project.",
      ),
    );

    await expect(
      deleteProject({ workspaceId: WORKSPACE_ID, projectId: PROJECT_ID }),
    ).rejects.toThrow(
      "Move or delete this project's rooms before deleting the project.",
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("uses stable user-facing errors for repository failures", async () => {
    mocks.createProject.mockRejectedValue(new Error("raw database error"));

    await expect(
      createProject({ workspaceId: WORKSPACE_ID, name: "Activation" }),
    ).rejects.toThrow("We could not create the project.");
  });
});
